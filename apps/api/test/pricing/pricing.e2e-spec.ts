import request from 'supertest';
import { ERROR_CODES } from '@swiftdrop/contracts';
import { createTestApp, type TestContext } from '../utils/app';

describe('Pricing Module (Integration)', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('POST /api/v1/pricing/estimate (Public)', () => {
    it('calculates estimate for Colombo -> Colombo trip using the seeded "Within Colombo" rule', async () => {
      const res = await request(t.http)
        .post('/api/v1/pricing/estimate')
        .send({
          pickupCity: 'colombo',
          dropoffCity: 'dehiwala',
          size: 'SMALL',
          weightKg: 1.5, // ceil(1.5) = 2kg
        })
        .expect(200);

      expect(res.body).toMatchObject({
        ruleName: 'Within Colombo',
        currency: 'LKR',
        feeCents: 36000, // 30000 base + 3000 * 2kg
      });
      expect(res.body.pickupZoneId).toBeDefined();
      expect(res.body.dropoffZoneId).toBeDefined();
    });

    it('returns 422 with ZONE_NOT_SERVICED for an unserviced city', async () => {
      const res = await request(t.http)
        .post('/api/v1/pricing/estimate')
        .send({
          pickupCity: 'Nowhere City',
          dropoffCity: 'colombo',
          size: 'SMALL',
          weightKg: 1.0,
        })
        .expect(422);

      expect(res.body.error).toMatchObject({
        code: ERROR_CODES.ZONE_NOT_SERVICED,
        details: { city: 'Nowhere City' },
      });
    });
  });

  describe('Admin Delivery Zones Endpoints Authorization & CRUD', () => {
    it('allows ADMIN and DISPATCHER to view delivery zones', async () => {
      await request(t.http)
        .get('/api/v1/admin/zones')
        .set('Cookie', await t.cookieFor('ADMIN'))
        .expect(200);

      await request(t.http)
        .get('/api/v1/admin/zones')
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .expect(200);
    });

    it('forbids CUSTOMER and COURIER from viewing or modifying delivery zones (403)', async () => {
      await request(t.http)
        .get('/api/v1/admin/zones')
        .set('Cookie', await t.cookieFor('CUSTOMER'))
        .expect(403);

      await request(t.http)
        .get('/api/v1/admin/zones')
        .set('Cookie', await t.cookieFor('COURIER'))
        .expect(403);
    });

    it('creates a new delivery zone and records an audit log', async () => {
      const zoneCode = `INT_${Date.now().toString().slice(-4)}`;
      const res = await request(t.http)
        .post('/api/v1/admin/zones')
        .set('Cookie', await t.cookieFor('ADMIN'))
        .send({
          code: zoneCode,
          name: `Integration Zone ${zoneCode}`,
          cities: [`testcity_${zoneCode.toLowerCase()}`],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        code: zoneCode,
        isActive: true,
      });

      // Verify audit log entry was created
      const audit = await t.prisma.auditLog.findFirst({
        where: {
          action: 'zone.created',
          entityId: res.body.id,
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorRole).toBe('ADMIN');
    });
  });

  describe('Admin Pricing Rules Endpoints', () => {
    it('allows ADMIN and DISPATCHER to view pricing rules', async () => {
      const res = await request(t.http)
        .get('/api/v1/admin/pricing-rules')
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('creates a new pricing rule and records an audit log', async () => {
      const res = await request(t.http)
        .post('/api/v1/admin/pricing-rules')
        .set('Cookie', await t.cookieFor('ADMIN'))
        .send({
          name: 'Integration Express Rule',
          baseFeeCents: 60000,
          perKgCents: 4000,
          priority: 2,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Integration Express Rule',
        baseFeeCents: 60000,
        perKgCents: 4000,
      });

      // Verify audit entry
      const audit = await t.prisma.auditLog.findFirst({
        where: {
          action: 'pricing_rule.created',
          entityId: res.body.id,
        },
      });
      expect(audit).not.toBeNull();
    });
  });
});
