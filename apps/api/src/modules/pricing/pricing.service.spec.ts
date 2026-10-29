import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from '@swiftdrop/contracts';
import { AppError } from '../../common/errors/app-error';
import { PricingService } from './pricing.service';

describe('PricingService (Unit)', () => {
  let service: PricingService;
  let prismaMock: any;
  let auditMock: any;

  const zoneCMB = {
    id: 'zone-cmb',
    code: 'CMB',
    name: 'Colombo',
    cities: ['colombo', 'dehiwala', 'mount lavinia', 'kotte'],
    isActive: true,
  };

  const zoneKDY = {
    id: 'zone-kdy',
    code: 'KDY',
    name: 'Kandy',
    cities: ['kandy', 'peradeniya', 'katugastota'],
    isActive: true,
  };

  const zoneInactive = {
    id: 'zone-inactive',
    code: 'JFN',
    name: 'Jaffna',
    cities: ['jaffna'],
    isActive: false,
  };

  beforeEach(() => {
    prismaMock = {
      deliveryZone: {
        findMany: jest.fn().mockResolvedValue([zoneCMB, zoneKDY]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      pricingRule: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    auditMock = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    service = new PricingService(prismaMock, auditMock);
  });

  describe('Zone Resolution & Servicing', () => {
    it('throws ZONE_NOT_SERVICED (422) when pickup city is not in any active zone', async () => {
      await expect(
        service.estimate({
          pickupCity: 'Unknown City',
          dropoffCity: 'colombo',
          size: 'SMALL',
          weightKg: 1.5,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.ZONE_NOT_SERVICED,
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          details: { city: 'Unknown City' },
        }),
      );
    });

    it('throws ZONE_NOT_SERVICED (422) when dropoff city is not in any active zone', async () => {
      await expect(
        service.estimate({
          pickupCity: 'colombo',
          dropoffCity: 'Atlantis',
          size: 'SMALL',
          weightKg: 1.5,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.ZONE_NOT_SERVICED,
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          details: { city: 'Atlantis' },
        }),
      );
    });

    it('throws ZONE_NOT_SERVICED when city belongs to an inactive zone', async () => {
      // Zone Jaffna is inactive, so query only returns active zones
      prismaMock.deliveryZone.findMany.mockResolvedValue([zoneCMB, zoneKDY]);

      await expect(
        service.estimate({
          pickupCity: 'jaffna',
          dropoffCity: 'colombo',
          size: 'SMALL',
          weightKg: 1.0,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.ZONE_NOT_SERVICED,
        }),
      );
    });

    it('resolves zones case-insensitively with leading and trailing whitespace trimmed', async () => {
      const defaultRule = {
        id: 'rule-default',
        name: 'Island-wide default',
        fromZoneId: null,
        toZoneId: null,
        size: null,
        baseFeeCents: 45000,
        perKgCents: 5000,
        priority: 0,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date('2026-01-01'),
      };
      prismaMock.pricingRule.findMany.mockResolvedValue([defaultRule]);

      const result = await service.estimate({
        pickupCity: '  CoLoMbO   ',
        dropoffCity: '  KaNdY  ',
        size: 'SMALL',
        weightKg: 1.0,
      });

      expect(result.pickupZoneId).toBe(zoneCMB.id);
      expect(result.dropoffZoneId).toBe(zoneKDY.id);
      expect(result.feeCents).toBe(50000); // 45000 + 5000 * 1
    });
  });

  describe('Rule Specificity, Priority, and Tie-breaking', () => {
    it('picks the most specific rule over a higher-priority general rule', async () => {
      const generalHighPriority = {
        id: 'rule-general',
        name: 'General High Priority',
        fromZoneId: null,
        toZoneId: null,
        size: null, // specificity = 0
        baseFeeCents: 50000,
        perKgCents: 5000,
        priority: 100,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date('2026-01-01'),
      };

      const specificColomboTrip = {
        id: 'rule-specific',
        name: 'Colombo to Colombo Trip',
        fromZoneId: zoneCMB.id,
        toZoneId: zoneCMB.id,
        size: null, // specificity = 2
        baseFeeCents: 30000,
        perKgCents: 3000,
        priority: 5,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date('2026-01-01'),
      };

      prismaMock.pricingRule.findMany.mockResolvedValue([generalHighPriority, specificColomboTrip]);

      const result = await service.estimate({
        pickupCity: 'colombo',
        dropoffCity: 'dehiwala',
        size: 'SMALL',
        weightKg: 2.0,
      });

      expect(result.ruleId).toBe(specificColomboTrip.id);
      expect(result.ruleName).toBe(specificColomboTrip.name);
      // Fee = 30000 + 3000 * 2 = 36000
      expect(result.feeCents).toBe(36000);
    });

    it('breaks ties between equal-specificity rules by highest priority', async () => {
      const rulePriority5 = {
        id: 'rule-p5',
        name: 'Size Rule Priority 5',
        fromZoneId: null,
        toZoneId: null,
        size: 'LARGE' as const, // specificity = 1
        baseFeeCents: 70000,
        perKgCents: 4000,
        priority: 5,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date('2026-01-01'),
      };

      const rulePriority10 = {
        id: 'rule-p10',
        name: 'Size Rule Priority 10',
        fromZoneId: null,
        toZoneId: null,
        size: 'LARGE' as const, // specificity = 1
        baseFeeCents: 60000,
        perKgCents: 3000,
        priority: 10,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date('2026-01-01'),
      };

      prismaMock.pricingRule.findMany.mockResolvedValue([rulePriority5, rulePriority10]);

      const result = await service.estimate({
        pickupCity: 'colombo',
        dropoffCity: 'kandy',
        size: 'LARGE',
        weightKg: 1.0,
      });

      expect(result.ruleId).toBe(rulePriority10.id);
      expect(result.feeCents).toBe(63000); // 60000 + 3000 * 1
    });

    it('breaks ties between equal-specificity and equal-priority rules by newest rule', async () => {
      const olderRule = {
        id: 'rule-older',
        name: 'Older Rule',
        fromZoneId: null,
        toZoneId: null,
        size: null,
        baseFeeCents: 40000,
        perKgCents: 5000,
        priority: 0,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date('2026-01-01'),
      };

      const newerRule = {
        id: 'rule-newer',
        name: 'Newer Rule',
        fromZoneId: null,
        toZoneId: null,
        size: null,
        baseFeeCents: 45000,
        perKgCents: 5000,
        priority: 0,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date('2026-02-01'),
      };

      prismaMock.pricingRule.findMany.mockResolvedValue([olderRule, newerRule]);

      const result = await service.estimate({
        pickupCity: 'colombo',
        dropoffCity: 'kandy',
        size: 'MEDIUM',
        weightKg: 1.0,
      });

      expect(result.ruleId).toBe(newerRule.id);
      expect(result.feeCents).toBe(50000);
    });
  });

  describe('Wildcard Handling', () => {
    it('applies catch-all wildcard rule when no specific rule exists', async () => {
      const wildcardRule = {
        id: 'rule-catchall',
        name: 'Catch-all',
        fromZoneId: null,
        toZoneId: null,
        size: null,
        baseFeeCents: 45000,
        perKgCents: 5000,
        priority: 0,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date('2026-01-01'),
      };

      prismaMock.pricingRule.findMany.mockResolvedValue([wildcardRule]);

      const result = await service.estimate({
        pickupCity: 'kandy',
        dropoffCity: 'colombo',
        size: 'SMALL',
        weightKg: 1.0,
      });

      expect(result.ruleId).toBe(wildcardRule.id);
      expect(result.feeCents).toBe(50000);
    });

    it('does not match a rule when destination zone differs from rule destination', async () => {
      const colomboOnly = {
        id: 'rule-colombo-internal',
        name: 'Within Colombo',
        fromZoneId: zoneCMB.id,
        toZoneId: zoneCMB.id,
        size: null,
        baseFeeCents: 30000,
        perKgCents: 3000,
        priority: 10,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date('2026-01-01'),
      };

      const defaultRule = {
        id: 'rule-default',
        name: 'Island-wide default',
        fromZoneId: null,
        toZoneId: null,
        size: null,
        baseFeeCents: 45000,
        perKgCents: 5000,
        priority: 0,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date('2026-01-01'),
      };

      // Trip is Colombo -> Kandy, so Within Colombo rule does NOT match
      prismaMock.pricingRule.findMany.mockResolvedValue([colomboOnly, defaultRule]);

      const result = await service.estimate({
        pickupCity: 'colombo',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 1.0,
      });

      expect(result.ruleId).toBe(defaultRule.id);
      expect(result.feeCents).toBe(50000);
    });
  });

  describe('Weight Ceiling Rounding', () => {
    it('rounds fractional weight up to next whole kg integer', async () => {
      const rule = {
        id: 'rule-test',
        name: 'Test Rule',
        fromZoneId: null,
        toZoneId: null,
        size: null,
        baseFeeCents: 10000,
        perKgCents: 2000,
        priority: 0,
        isActive: true,
        validFrom: null,
        validTo: null,
        createdAt: new Date(),
      };
      prismaMock.pricingRule.findMany.mockResolvedValue([rule]);

      // 1.2 kg -> ceil is 2 kg -> fee = 10000 + 2000 * 2 = 14000
      const res1 = await service.estimate({
        pickupCity: 'colombo',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 1.2,
      });
      expect(res1.feeCents).toBe(14000);

      // 0.05 kg -> ceil is 1 kg -> fee = 10000 + 2000 * 1 = 12000
      const res2 = await service.estimate({
        pickupCity: 'colombo',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 0.05,
      });
      expect(res2.feeCents).toBe(12000);

      // Exactly 3.0 kg -> ceil is 3 kg -> fee = 10000 + 2000 * 3 = 16000
      const res3 = await service.estimate({
        pickupCity: 'colombo',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 3.0,
      });
      expect(res3.feeCents).toBe(16000);
    });
  });

  describe('Admin Zone Management', () => {
    it('rejects duplicate zone code with CONFLICT (409)', async () => {
      prismaMock.deliveryZone.findUnique.mockResolvedValue(zoneCMB);

      await expect(
        service.createZone({
          code: 'CMB',
          name: 'Colombo North',
          cities: ['wattala'],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.CONFLICT,
          status: HttpStatus.CONFLICT,
        }),
      );
    });

    it('rejects creating zone with cities already serviced by another active zone', async () => {
      prismaMock.deliveryZone.findUnique.mockResolvedValue(null);
      prismaMock.deliveryZone.findMany.mockResolvedValue([zoneCMB]);

      // 'colombo' is already in active zoneCMB
      await expect(
        service.createZone({
          code: 'NEW',
          name: 'New Zone',
          cities: ['colombo', 'homagama'],
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.CONFLICT,
          status: HttpStatus.CONFLICT,
        }),
      );
    });

    it('records audit log on zone creation', async () => {
      prismaMock.deliveryZone.findUnique.mockResolvedValue(null);
      prismaMock.deliveryZone.findMany.mockResolvedValue([]);
      prismaMock.deliveryZone.create.mockResolvedValue({
        id: 'new-zone-id',
        code: 'NEW',
        name: 'New Zone',
        cities: ['homagama'],
        isActive: true,
      });

      const actor = { id: 'admin-1', role: 'ADMIN' as const, email: 'admin@swiftdrop.test' };
      await service.createZone(
        {
          code: 'NEW',
          name: 'New Zone',
          cities: ['homagama'],
        },
        actor,
      );

      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'zone.created',
          entityType: 'zone',
          entityId: 'new-zone-id',
          actor: { id: 'admin-1', role: 'ADMIN' },
        }),
      );
    });
  });
});
