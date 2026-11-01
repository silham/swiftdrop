import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@swiftdrop/contracts';
import type { AuthUser } from '../../common/auth';
import { AppError, notFound } from '../../common/errors/app-error';
import { PrismaService } from '../../infra/prisma';
import { AuditService } from '../audit';
import type {
  CreatePricingRuleDto,
  CreateZoneDto,
  EstimateRequestDto,
  EstimateResponseDto,
  PricingRuleDto,
  UpdatePricingRuleDto,
  UpdateZoneDto,
  ZoneDto,
} from './dto/pricing.dto';

/**
 * PUBLIC SERVICE — source of truth for delivery fees (ParcelsService calls `estimate` when creating
 * a parcel, so the client can never set its own fee). Owner: M7.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Estimates the delivery fee based on active delivery zones and configurable pricing rules.
   * Throws ZONE_NOT_SERVICED (422) if either pickup or dropoff city is not in an active zone.
   * Rounding: weight is rounded up via Math.ceil(weightKg).
   */
  async estimate(input: EstimateRequestDto): Promise<EstimateResponseDto> {
    const pickupCityClean = input.pickupCity.trim().toLowerCase();
    const dropoffCityClean = input.dropoffCity.trim().toLowerCase();

    // 1. Resolve active zones for pickup and dropoff cities
    const activeZones = await this.prisma.deliveryZone.findMany({
      where: { isActive: true },
    });

    const pickupZone = activeZones.find((z) =>
      z.cities.some((c) => c.trim().toLowerCase() === pickupCityClean),
    );
    if (!pickupZone) {
      throw new AppError(
        ERROR_CODES.ZONE_NOT_SERVICED,
        `No active delivery zone services pickup city: ${input.pickupCity}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { city: input.pickupCity },
      );
    }

    const dropoffZone = activeZones.find((z) =>
      z.cities.some((c) => c.trim().toLowerCase() === dropoffCityClean),
    );
    if (!dropoffZone) {
      throw new AppError(
        ERROR_CODES.ZONE_NOT_SERVICED,
        `No active delivery zone services dropoff city: ${input.dropoffCity}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { city: input.dropoffCity },
      );
    }

    // 2. Query active pricing rules within validity window
    const now = new Date();
    const activeRules = await this.prisma.pricingRule.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
    });

    // 3. Filter candidate rules (wildcards allow null zone/size)
    const candidates = activeRules.filter((rule) => {
      const fromMatch = rule.fromZoneId === null || rule.fromZoneId === pickupZone.id;
      const toMatch = rule.toZoneId === null || rule.toZoneId === dropoffZone.id;
      const sizeMatch = rule.size === null || rule.size === input.size;
      return fromMatch && toMatch && sizeMatch;
    });

    if (candidates.length === 0) {
      throw new AppError(
        ERROR_CODES.NOT_FOUND,
        'No matching pricing rule found for the specified trip and parcel size',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 4. Calculate specificity (number of non-null match fields among fromZoneId, toZoneId, size)
    const scored = candidates.map((rule) => {
      let specificity = 0;
      if (rule.fromZoneId !== null) specificity++;
      if (rule.toZoneId !== null) specificity++;
      if (rule.size !== null) specificity++;
      return { rule, specificity };
    });

    // 5. Pick the most specific rule; break ties by highest priority, then newest rule
    scored.sort((a, b) => {
      if (b.specificity !== a.specificity) {
        return b.specificity - a.specificity;
      }
      if (b.rule.priority !== a.rule.priority) {
        return b.rule.priority - a.rule.priority;
      }
      return b.rule.createdAt.getTime() - a.rule.createdAt.getTime();
    });

    const chosen = scored[0].rule;

    // 6. Fee = baseFeeCents + perKgCents * ceil(weightKg) as an integer
    const roundedWeight = Math.ceil(input.weightKg);
    const feeCents = Math.round(chosen.baseFeeCents + chosen.perKgCents * roundedWeight);

    return {
      feeCents,
      currency: 'LKR',
      pickupZoneId: pickupZone.id,
      dropoffZoneId: dropoffZone.id,
      ruleId: chosen.id,
      ruleName: chosen.name,
    };
  }

  async listZones(): Promise<ZoneDto[]> {
    return this.prisma.deliveryZone.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createZone(dto: CreateZoneDto, actor?: AuthUser): Promise<ZoneDto> {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();

    const existingCode = await this.prisma.deliveryZone.findUnique({
      where: { code },
    });
    if (existingCode) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        `Delivery zone with code "${code}" already exists`,
        HttpStatus.CONFLICT,
      );
    }

    const cleanedCities = Array.from(new Set(dto.cities.map((c) => c.trim().toLowerCase())));
    const isActive = dto.isActive ?? true;

    if (isActive) {
      const activeZones = await this.prisma.deliveryZone.findMany({
        where: { isActive: true },
      });
      for (const city of cleanedCities) {
        const overlap = activeZones.find((z) =>
          z.cities.map((c) => c.trim().toLowerCase()).includes(city),
        );
        if (overlap) {
          throw new AppError(
            ERROR_CODES.CONFLICT,
            `City "${city}" is already serviced by active zone "${overlap.name}" (${overlap.code})`,
            HttpStatus.CONFLICT,
            { city, zone: overlap.name },
          );
        }
      }
    }

    const zone = await this.prisma.deliveryZone.create({
      data: {
        code,
        name,
        cities: cleanedCities,
        isActive,
      },
    });

    await this.audit.record({
      actor: actor ? { id: actor.id, role: actor.role } : null,
      action: 'zone.created',
      entityType: 'zone',
      entityId: zone.id,
      metadata: { code: zone.code, name: zone.name, citiesCount: zone.cities.length },
    });

    return zone;
  }

  async updateZone(id: string, dto: UpdateZoneDto, actor?: AuthUser): Promise<ZoneDto> {
    const existing = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!existing) {
      throw notFound('Delivery zone');
    }

    if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
      const codeTaken = await this.prisma.deliveryZone.findUnique({
        where: { code: dto.code.trim().toUpperCase() },
      });
      if (codeTaken) {
        throw new AppError(
          ERROR_CODES.CONFLICT,
          `Delivery zone with code "${dto.code.trim().toUpperCase()}" already exists`,
          HttpStatus.CONFLICT,
        );
      }
    }

    const willBeActive = dto.isActive !== undefined ? dto.isActive : existing.isActive;
    const targetCities = dto.cities
      ? Array.from(new Set(dto.cities.map((c) => c.trim().toLowerCase())))
      : existing.cities.map((c) => c.trim().toLowerCase());

    if (willBeActive) {
      const otherActiveZones = await this.prisma.deliveryZone.findMany({
        where: { isActive: true, id: { not: id } },
      });
      for (const city of targetCities) {
        const overlap = otherActiveZones.find((z) =>
          z.cities.map((c) => c.trim().toLowerCase()).includes(city),
        );
        if (overlap) {
          throw new AppError(
            ERROR_CODES.CONFLICT,
            `City "${city}" is already serviced by active zone "${overlap.name}" (${overlap.code})`,
            HttpStatus.CONFLICT,
            { city, zone: overlap.name },
          );
        }
      }
    }

    const updated = await this.prisma.deliveryZone.update({
      where: { id },
      data: {
        code: dto.code ? dto.code.trim().toUpperCase() : undefined,
        name: dto.name ? dto.name.trim() : undefined,
        cities: dto.cities ? targetCities : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });

    await this.audit.record({
      actor: actor ? { id: actor.id, role: actor.role } : null,
      action: 'zone.updated',
      entityType: 'zone',
      entityId: id,
      metadata: { code: updated.code, name: updated.name, isActive: updated.isActive },
    });

    return updated;
  }

  async listRules(): Promise<PricingRuleDto[]> {
    const rules = await this.prisma.pricingRule.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: { fromZone: true, toZone: true },
    });

    return rules.map((r) => ({
      id: r.id,
      name: r.name,
      fromZoneId: r.fromZoneId,
      toZoneId: r.toZoneId,
      fromZoneName: r.fromZone?.name ?? null,
      toZoneName: r.toZone?.name ?? null,
      size: r.size,
      baseFeeCents: r.baseFeeCents,
      perKgCents: r.perKgCents,
      priority: r.priority,
      isActive: r.isActive,
      validFrom: r.validFrom,
      validTo: r.validTo,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createRule(dto: CreatePricingRuleDto, actor?: AuthUser): Promise<PricingRuleDto> {
    if (dto.baseFeeCents < 0 || dto.perKgCents < 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        'Base fee and per-kg rate cannot be negative',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.fromZoneId) {
      const fromZone = await this.prisma.deliveryZone.findUnique({
        where: { id: dto.fromZoneId },
      });
      if (!fromZone) throw notFound('Source delivery zone');
    }

    if (dto.toZoneId) {
      const toZone = await this.prisma.deliveryZone.findUnique({
        where: { id: dto.toZoneId },
      });
      if (!toZone) throw notFound('Destination delivery zone');
    }

    const rule = await this.prisma.pricingRule.create({
      data: {
        name: dto.name.trim(),
        fromZoneId: dto.fromZoneId ?? null,
        toZoneId: dto.toZoneId ?? null,
        size: dto.size ?? null,
        baseFeeCents: dto.baseFeeCents,
        perKgCents: dto.perKgCents,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validTo: dto.validTo ? new Date(dto.validTo) : null,
      },
      include: { fromZone: true, toZone: true },
    });

    await this.audit.record({
      actor: actor ? { id: actor.id, role: actor.role } : null,
      action: 'pricing_rule.created',
      entityType: 'pricing_rule',
      entityId: rule.id,
      metadata: { name: rule.name, baseFeeCents: rule.baseFeeCents, perKgCents: rule.perKgCents },
    });

    return {
      id: rule.id,
      name: rule.name,
      fromZoneId: rule.fromZoneId,
      toZoneId: rule.toZoneId,
      fromZoneName: rule.fromZone?.name ?? null,
      toZoneName: rule.toZone?.name ?? null,
      size: rule.size,
      baseFeeCents: rule.baseFeeCents,
      perKgCents: rule.perKgCents,
      priority: rule.priority,
      isActive: rule.isActive,
      validFrom: rule.validFrom,
      validTo: rule.validTo,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  async updateRule(
    id: string,
    dto: UpdatePricingRuleDto,
    actor?: AuthUser,
  ): Promise<PricingRuleDto> {
    const existing = await this.prisma.pricingRule.findUnique({ where: { id } });
    if (!existing) {
      throw notFound('Pricing rule');
    }

    if (dto.baseFeeCents !== undefined && dto.baseFeeCents < 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        'Base fee cannot be negative',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.perKgCents !== undefined && dto.perKgCents < 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        'Per-kg rate cannot be negative',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.fromZoneId) {
      const fromZone = await this.prisma.deliveryZone.findUnique({
        where: { id: dto.fromZoneId },
      });
      if (!fromZone) throw notFound('Source delivery zone');
    }

    if (dto.toZoneId) {
      const toZone = await this.prisma.deliveryZone.findUnique({
        where: { id: dto.toZoneId },
      });
      if (!toZone) throw notFound('Destination delivery zone');
    }

    const updated = await this.prisma.pricingRule.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        fromZoneId: dto.fromZoneId !== undefined ? dto.fromZoneId : undefined,
        toZoneId: dto.toZoneId !== undefined ? dto.toZoneId : undefined,
        size: dto.size !== undefined ? dto.size : undefined,
        baseFeeCents: dto.baseFeeCents !== undefined ? dto.baseFeeCents : undefined,
        perKgCents: dto.perKgCents !== undefined ? dto.perKgCents : undefined,
        priority: dto.priority !== undefined ? dto.priority : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
        validFrom:
          dto.validFrom !== undefined
            ? dto.validFrom
              ? new Date(dto.validFrom)
              : null
            : undefined,
        validTo:
          dto.validTo !== undefined ? (dto.validTo ? new Date(dto.validTo) : null) : undefined,
      },
      include: { fromZone: true, toZone: true },
    });

    await this.audit.record({
      actor: actor ? { id: actor.id, role: actor.role } : null,
      action: 'pricing_rule.updated',
      entityType: 'pricing_rule',
      entityId: id,
      metadata: { name: updated.name, isActive: updated.isActive },
    });

    return {
      id: updated.id,
      name: updated.name,
      fromZoneId: updated.fromZoneId,
      toZoneId: updated.toZoneId,
      fromZoneName: updated.fromZone?.name ?? null,
      toZoneName: updated.toZone?.name ?? null,
      size: updated.size,
      baseFeeCents: updated.baseFeeCents,
      perKgCents: updated.perKgCents,
      priority: updated.priority,
      isActive: updated.isActive,
      validFrom: updated.validFrom,
      validTo: updated.validTo,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
