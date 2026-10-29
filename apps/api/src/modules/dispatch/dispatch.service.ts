import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@swiftdrop/contracts';
import type { CourierAssignment, Prisma } from '@swiftdrop/db';
import type { AuthUser } from '../../common/auth';
import { AppError, notFound } from '../../common/errors/app-error';
import { paginated } from '../../common/pagination/pagination';
import { OutboxService } from '../../infra/events';
import { PrismaService } from '../../infra/prisma';
import { AuditService } from '../audit';
import type {
  AssignmentDto,
  CourierWorkloadDto,
  CreateAssignmentDto,
  ListUnassignedQuery,
  UnassignedParcelDto,
} from './dto/dispatch.dto';

/**
 * PUBLIC SERVICE — courier assignment and workload management.
 * M6 (courier) uses `getActiveAssignment` to authorize courier actions.
 * Owner: M7.
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** The ACTIVE assignment for a parcel, or null. */
  getActiveAssignment(
    parcelId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CourierAssignment | null> {
    return (tx ?? this.prisma).courierAssignment.findFirst({
      where: { parcelId, status: 'ACTIVE' },
    });
  }

  /** Mark the active assignment COMPLETED (called when a parcel reaches DELIVERED). */
  async completeAssignment(parcelId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    await db.courierAssignment.updateMany({
      where: { parcelId, status: 'ACTIVE' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  /**
   * Lists unassigned parcels (status CREATED or FAILED with no ACTIVE assignment).
   * Filterable by zoneId, sorted oldest first. Omits sensitive recipient contact info.
   */
  async listUnassigned(q: ListUnassignedQuery) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ParcelWhereInput = {
      status: { in: ['CREATED', 'FAILED'] },
      assignments: {
        none: { status: 'ACTIVE' },
      },
      ...(q.zoneId ? { pickupZoneId: q.zoneId } : {}),
    };

    const [parcels, total] = await Promise.all([
      this.prisma.parcel.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: pageSize,
        include: { pickupZone: true },
      }),
      this.prisma.parcel.count({ where }),
    ]);

    const data: UnassignedParcelDto[] = parcels.map((p) => ({
      id: p.id,
      trackingNumber: p.trackingNumber,
      status: p.status,
      pickupZoneId: p.pickupZoneId,
      pickupZoneName: p.pickupZone?.name ?? null,
      pickupCity: p.pickupCity,
      dropoffCity: p.dropoffCity,
      size: p.size,
      weightKg: Number(p.weightKg),
      feeCents: p.feeCents,
      currency: p.currency,
      createdAt: p.createdAt,
    }));

    return paginated(data, total, q);
  }

  /**
   * In ONE transaction:
   * 1. Check parcel is assignable (status CREATED or FAILED, no ACTIVE assignment)
   * 2. Check courier is available (role COURIER, isAvailable = true, active workload < maxActiveParcels)
   * 3. Create courier assignment
   * 4. Record audit entry ('parcel.assigned')
   * 5. Enqueue outbox event ('parcel.courier_assigned')
   */
  async assign(actor: AuthUser, dto: CreateAssignmentDto): Promise<AssignmentDto> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock parcel and verify existence and status
      const parcel = await tx.parcel.findUnique({
        where: { id: dto.parcelId },
      });
      if (!parcel) {
        throw notFound('Parcel');
      }

      if (parcel.status !== 'CREATED' && parcel.status !== 'FAILED') {
        throw new AppError(
          ERROR_CODES.INVALID_STATUS_TRANSITION,
          `Cannot assign parcel in status ${parcel.status}. Status must be CREATED or FAILED.`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check if parcel already has an ACTIVE assignment
      const existingAssignment = await tx.courierAssignment.findFirst({
        where: { parcelId: dto.parcelId, status: 'ACTIVE' },
      });
      if (existingAssignment) {
        throw new AppError(
          ERROR_CODES.ALREADY_ASSIGNED,
          'Parcel already has an active courier assignment',
          HttpStatus.CONFLICT,
        );
      }

      // 2. Verify courier availability and workload capacity
      const courier = await tx.user.findUnique({
        where: { id: dto.courierId },
        include: { courierProfile: true },
      });
      if (!courier || courier.role !== 'COURIER' || !courier.isActive) {
        throw new AppError(
          ERROR_CODES.COURIER_UNAVAILABLE,
          'Courier not found or account is inactive',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!courier.courierProfile || !courier.courierProfile.isAvailable) {
        throw new AppError(
          ERROR_CODES.COURIER_UNAVAILABLE,
          'Courier is currently marked unavailable',
          HttpStatus.BAD_REQUEST,
        );
      }

      const activeCount = await tx.courierAssignment.count({
        where: { courierId: dto.courierId, status: 'ACTIVE' },
      });

      if (activeCount >= courier.courierProfile.maxActiveParcels) {
        throw new AppError(
          ERROR_CODES.COURIER_UNAVAILABLE,
          `Courier active workload limit reached (${activeCount}/${courier.courierProfile.maxActiveParcels})`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // 3. Create assignment
      const assignment = await tx.courierAssignment.create({
        data: {
          parcelId: dto.parcelId,
          courierId: dto.courierId,
          assignedById: actor.id,
          status: 'ACTIVE',
        },
      });

      // 4. Record audit entry
      await this.audit.record(
        {
          actor: { id: actor.id, role: actor.role },
          action: 'parcel.assigned',
          entityType: 'parcel',
          entityId: dto.parcelId,
          metadata: {
            courierId: dto.courierId,
            assignmentId: assignment.id,
            trackingNumber: parcel.trackingNumber,
          },
        },
        tx,
      );

      // 5. Enqueue domain event to transactional outbox
      await this.outbox.enqueue(tx, 'parcel.courier_assigned', {
        parcelId: dto.parcelId,
        trackingNumber: parcel.trackingNumber,
        courierId: dto.courierId,
        assignedById: actor.id,
      });

      return {
        id: assignment.id,
        parcelId: assignment.parcelId,
        courierId: assignment.courierId,
        status: assignment.status,
        assignedAt: assignment.assignedAt,
      };
    });
  }

  /**
   * Unassign courier from parcel. Allowed only while parcel is still CREATED or PICKED_UP.
   * Cancels the assignment and writes an audit entry.
   */
  async unassign(actor: AuthUser, assignmentId: string): Promise<{ success: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.courierAssignment.findUnique({
        where: { id: assignmentId },
        include: { parcel: true },
      });
      if (!assignment) {
        throw notFound('Assignment');
      }

      if (assignment.status !== 'ACTIVE') {
        throw new AppError(
          ERROR_CODES.CONFLICT,
          'Assignment is not in ACTIVE status',
          HttpStatus.CONFLICT,
        );
      }

      // Only allow unassigning if parcel is still in early stages
      if (assignment.parcel.status !== 'CREATED' && assignment.parcel.status !== 'PICKED_UP') {
        throw new AppError(
          ERROR_CODES.INVALID_STATUS_TRANSITION,
          `Cannot unassign courier for parcel in status ${assignment.parcel.status}. Unassign is only allowed for CREATED or PICKED_UP parcels.`,
          HttpStatus.BAD_REQUEST,
        );
      }

      await tx.courierAssignment.update({
        where: { id: assignmentId },
        data: { status: 'CANCELLED' },
      });

      await this.audit.record(
        {
          actor: { id: actor.id, role: actor.role },
          action: 'parcel.unassigned',
          entityType: 'parcel',
          entityId: assignment.parcelId,
          metadata: {
            assignmentId,
            courierId: assignment.courierId,
            trackingNumber: assignment.parcel.trackingNumber,
          },
        },
        tx,
      );

      return { success: true };
    });
  }

  /**
   * Returns courier workload stats: active delivery count vs capacity limit.
   */
  async courierWorkload(): Promise<CourierWorkloadDto[]> {
    const couriers = await this.prisma.user.findMany({
      where: { role: 'COURIER', isActive: true },
      include: {
        courierProfile: {
          include: { zone: true },
        },
        courierAssignments: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return couriers.map((c) => ({
      courierId: c.id,
      name: c.name,
      email: c.email,
      zoneId: c.courierProfile?.zoneId ?? null,
      zoneName: c.courierProfile?.zone?.name ?? null,
      isAvailable: c.courierProfile?.isAvailable ?? false,
      activeParcels: c.courierAssignments.length,
      maxActiveParcels: c.courierProfile?.maxActiveParcels ?? 15,
    }));
  }
}
