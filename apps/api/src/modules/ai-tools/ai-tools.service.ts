import { Injectable, Logger } from '@nestjs/common';
import { FAILURE_REASONS, PARCEL_SIZES, PARCEL_STATUSES } from '@swiftdrop/contracts';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth';
import { AppError, notFound } from '../../common/errors/app-error';
import { PaginationQuery } from '../../common/pagination/pagination';
import { BookingsService, CreateBookingDto, ListMyParcelsQuery } from '../bookings';
import { CourierService, CourierStatusUpdateDto } from '../courier';
import {
  CreateAssignmentDto,
  DispatchService,
  ListAssignmentsQuery,
  ListUnassignedQuery,
} from '../dispatch';
import { MerchantsService } from '../merchants';
import { ParcelsService } from '../parcels';
import { EstimateRequestDto, PricingService } from '../pricing';
import { ReportRangeQuery, ReportsService } from '../reports';
import { defineTool, type AiTool, type ToolOutcome } from './ai-tool';
import { validateDto } from './validate-dto';

const STAFF = ['DISPATCHER', 'ADMIN'] as const;
const trackingNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^SD\d{9}$/, 'A tracking number looks like SD123456789')
  .describe('Tracking number, e.g. SD100000002');
const page = z.number().int().min(1).optional().describe('Page number, starting at 1');
const isoDate = z.string().optional().describe('ISO date, e.g. 2026-11-01');

/** Fee in cents → "LKR 550.00", so the model never has to do the division. */
export function formatMoney(cents: number, currency = 'LKR'): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

/**
 * The role-aware tool registry shared by the MCP server and the tracking page chatbot. Owner: M1.
 * Each tool only calls another module's public service (through its index.ts) with the signed-in
 * user, so ownership checks and audit entries are exactly those of the web app.
 */
@Injectable()
export class AiToolsService {
  private readonly logger = new Logger(AiToolsService.name);
  readonly tools: readonly AiTool[];

  constructor(
    private readonly parcels: ParcelsService,
    private readonly pricing: PricingService,
    private readonly bookings: BookingsService,
    private readonly merchants: MerchantsService,
    private readonly courier: CourierService,
    private readonly dispatch: DispatchService,
    private readonly reports: ReportsService,
  ) {
    this.tools = this.build();
  }

  /** Tools a caller may see: public ones for everyone, plus the ones for the user's role. */
  toolsFor(user: AuthUser | null): AiTool[] {
    return this.tools.filter(
      (t) => t.roles === 'public' || (user != null && t.roles.includes(user.role)),
    );
  }

  /**
   * Validate, authorise and run one tool. Errors become a short message for the model; expected
   * business errors (AppError) keep their message, anything else is logged by class name only
   * (inputs may contain addresses or phone numbers, so they are never logged).
   */
  async execute(name: string, rawInput: unknown, user: AuthUser | null): Promise<ToolOutcome> {
    const tool = this.toolsFor(user).find((t) => t.name === name);
    if (!tool) return { ok: false, text: `Unknown tool: ${name}` };

    const parsed = tool.input.safeParse(rawInput ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`);
      return { ok: false, text: `Invalid input. ${issues.join('; ')}` };
    }
    try {
      const data = await tool.run(parsed.data, user);
      return { ok: true, text: JSON.stringify(data), data };
    } catch (err) {
      if (err instanceof AppError) return { ok: false, text: err.message };
      this.logger.error(`tool ${name} failed (${(err as Error)?.constructor?.name ?? 'Error'})`);
      return { ok: false, text: 'Something went wrong while running that tool. Try again later.' };
    }
  }

  /** Resolve a tracking number to a parcel id; 404 if unknown. Ownership is checked by the service. */
  private async parcelId(tn: string): Promise<string> {
    const parcel = await this.parcels.findByTrackingNumber(tn);
    if (!parcel) throw notFound('Parcel');
    return parcel.id;
  }

  private build(): AiTool[] {
    return [
      // ---------- public ----------
      defineTool({
        name: 'track_parcel',
        title: 'Track a parcel',
        description:
          'Current status and status history of a parcel by its tracking number. Public information only (status, cities, times).',
        roles: 'public',
        readOnly: true,
        input: z.object({ trackingNumber }),
        run: ({ trackingNumber: tn }) => this.parcels.getPublicTracking(tn),
      }),
      defineTool({
        name: 'estimate_fee',
        title: 'Estimate a delivery fee',
        description:
          'Price of a delivery between two cities for a parcel size and weight, from the live pricing rules.',
        roles: 'public',
        readOnly: true,
        input: z.object({
          pickupCity: z
            .string()
            .min(2)
            .max(80)
            .describe('City the parcel is picked up in, e.g. colombo'),
          dropoffCity: z.string().min(2).max(80).describe('Destination city, e.g. kandy'),
          size: z.enum(PARCEL_SIZES).default('SMALL').describe('SMALL, MEDIUM or LARGE'),
          weightKg: z.number().positive().max(100).describe('Weight in kilograms'),
        }),
        run: async (input) => {
          const dto = await validateDto(EstimateRequestDto, input);
          const quote = await this.pricing.estimate(dto);
          return {
            pickupCity: input.pickupCity,
            dropoffCity: input.dropoffCity,
            size: input.size,
            weightKg: input.weightKg,
            fee: formatMoney(quote.feeCents, quote.currency),
            feeCents: quote.feeCents,
            currency: quote.currency,
            rule: quote.ruleName,
          };
        },
      }),
      defineTool({
        name: 'list_service_areas',
        title: 'List service areas',
        description: 'Delivery zones SwiftDrop serves and the cities in each.',
        roles: 'public',
        readOnly: true,
        input: z.object({}),
        run: async () =>
          (await this.pricing.listZones())
            .filter((z) => z.isActive)
            .map((z) => ({ zone: z.name, cities: z.cities })),
      }),

      // ---------- customer ----------
      defineTool({
        name: 'list_my_parcels',
        title: 'List my parcels',
        description:
          "The signed-in customer's parcels, newest first, optionally filtered by status.",
        roles: ['CUSTOMER'],
        readOnly: true,
        input: z.object({ status: z.enum(PARCEL_STATUSES).optional(), page }),
        run: async (input, user) =>
          this.bookings.listMine(
            user!,
            await validateDto(ListMyParcelsQuery, { ...input, pageSize: 20 }),
          ),
      }),
      defineTool({
        name: 'get_my_parcel',
        title: 'Get one of my parcels',
        description: 'Full details and history of one of the signed-in customer’s parcels.',
        roles: ['CUSTOMER'],
        readOnly: true,
        input: z.object({ trackingNumber }),
        run: async ({ trackingNumber: tn }, user) =>
          this.bookings.getMine(user!, await this.parcelId(tn)),
      }),
      defineTool({
        name: 'book_delivery',
        title: 'Book a delivery',
        description:
          'Create a delivery for the signed-in customer. The fee is calculated by SwiftDrop; confirm the details and the estimated fee with the user first.',
        roles: ['CUSTOMER'],
        readOnly: false,
        input: z.object({
          senderName: z.string(),
          senderPhone: z.string().describe('e.g. +94771234567'),
          pickupAddress: z.string(),
          pickupCity: z.string(),
          recipientName: z.string(),
          recipientPhone: z.string(),
          recipientEmail: z.string().optional(),
          dropoffAddress: z.string(),
          dropoffCity: z.string(),
          size: z.enum(PARCEL_SIZES),
          weightKg: z.number().positive(),
          description: z.string().optional(),
        }),
        run: async (input, user) => {
          const parcel = await this.bookings.create(
            user!,
            await validateDto(CreateBookingDto, input),
          );
          return { ...parcel, fee: formatMoney(parcel.feeCents, parcel.currency) };
        },
      }),

      // ---------- merchant ----------
      defineTool({
        name: 'list_my_orders',
        title: 'List my orders',
        description: "The signed-in merchant's delivery orders and their current states.",
        roles: ['MERCHANT'],
        readOnly: true,
        input: z.object({ status: z.enum(PARCEL_STATUSES).optional(), page }),
        run: async ({ status, page: p }, user) =>
          this.merchants.getMyParcels(
            user!,
            await validateDto(PaginationQuery, { page: p ?? 1, pageSize: 20 }),
            status,
          ),
      }),
      defineTool({
        name: 'merchant_summary',
        title: 'My order summary',
        description: "Counts of the signed-in merchant's orders by state.",
        roles: ['MERCHANT'],
        readOnly: true,
        input: z.object({}),
        run: async (_input, user) => this.merchants.getMyStats(user!),
      }),

      // ---------- courier ----------
      defineTool({
        name: 'list_my_deliveries',
        title: 'List my deliveries',
        description: 'Deliveries currently assigned to the signed-in courier.',
        roles: ['COURIER'],
        readOnly: true,
        input: z.object({}),
        run: async (_input, user) => this.courier.listAssigned(user!),
      }),
      defineTool({
        name: 'update_delivery_status',
        title: 'Update a delivery status',
        description:
          'Move one of my assigned deliveries to PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY or FAILED (FAILED needs a reason). Marking DELIVERED needs a photo, so it is only possible in the courier app.',
        roles: ['COURIER'],
        readOnly: false,
        input: z.object({
          trackingNumber,
          status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED']),
          failureReason: z.enum(FAILURE_REASONS).optional(),
          note: z.string().max(500).optional(),
        }),
        run: async ({ trackingNumber: tn, ...rest }, user) =>
          this.courier.updateStatus(
            user!,
            await this.parcelId(tn),
            await validateDto(CourierStatusUpdateDto, rest),
          ),
      }),

      // ---------- dispatcher / admin ----------
      defineTool({
        name: 'list_unassigned_parcels',
        title: 'List unassigned parcels',
        description: 'Parcels waiting for a courier, oldest first.',
        roles: STAFF,
        readOnly: true,
        input: z.object({ page }),
        run: async ({ page: p }) =>
          this.dispatch.listUnassigned(
            await validateDto(ListUnassignedQuery, { page: p ?? 1, pageSize: 20 }),
          ),
      }),
      defineTool({
        name: 'courier_workload',
        title: 'Courier workload',
        description: 'Active deliveries per courier, their capacity and availability.',
        roles: STAFF,
        readOnly: true,
        input: z.object({}),
        run: () => this.dispatch.courierWorkload(),
      }),
      defineTool({
        name: 'list_active_assignments',
        title: 'List active assignments',
        description: 'Parcels currently assigned to a courier.',
        roles: STAFF,
        readOnly: true,
        input: z.object({ page }),
        run: async ({ page: p }) =>
          this.dispatch.listActiveAssignments(
            await validateDto(ListAssignmentsQuery, { page: p ?? 1, pageSize: 20 }),
          ),
      }),
      defineTool({
        name: 'assign_parcel',
        title: 'Assign a parcel to a courier',
        description:
          'Assign an unassigned parcel to a courier (use courier_workload for courier ids). Recorded in the audit log as the signed-in dispatcher.',
        roles: STAFF,
        readOnly: false,
        input: z.object({ trackingNumber, courierId: z.string().min(1) }),
        run: async ({ trackingNumber: tn, courierId }, user) =>
          this.dispatch.assign(
            user!,
            await validateDto(CreateAssignmentDto, {
              parcelId: await this.parcelId(tn),
              courierId,
            }),
          ),
      }),
      defineTool({
        name: 'delivery_report',
        title: 'Delivery report',
        description: 'Totals, success rate and deliveries per day for a date range.',
        roles: STAFF,
        readOnly: true,
        input: z.object({ from: isoDate, to: isoDate }),
        run: async (input) => {
          const q = await validateDto(ReportRangeQuery, input);
          const [summary, perDay] = await Promise.all([
            this.reports.deliverySummary(q),
            this.reports.dailyVolume(q),
          ]);
          return { summary, perDay };
        },
      }),
    ];
  }
}
