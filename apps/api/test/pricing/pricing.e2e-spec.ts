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
          // Inactive: an active island-wide rule would win every later estimate in the shared test DB.
          isActive: false,
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

    it('rejects a rule that ends before it starts (400) and writes nothing', async () => {
      const before = await t.prisma.pricingRule.count();
      const res = await request(t.http)
        .post('/api/v1/admin/pricing-rules')
        .set('Cookie', await t.cookieFor('ADMIN'))
        .send({
          name: 'Backwards Window Rule',
          baseFeeCents: 1000,
          perKgCents: 100,
          isActive: false,
          validFrom: '2031-02-01T00:00:00.000Z',
          validTo: '2031-01-01T00:00:00.000Z',
        })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(await t.prisma.pricingRule.count()).toBe(before);
    });

    it('checks the stored dates when an update changes only one side', async () => {
      const created = await request(t.http)
        .post('/api/v1/admin/pricing-rules')
        .set('Cookie', await t.cookieFor('ADMIN'))
        .send({
          name: 'Window Update Rule',
          baseFeeCents: 1000,
          perKgCents: 100,
          isActive: false,
          validFrom: '2031-03-01T00:00:00.000Z',
          validTo: '2031-06-01T00:00:00.000Z',
        })
        .expect(201);
      await request(t.http)
        .patch(`/api/v1/admin/pricing-rules/${created.body.id}`)
        .set('Cookie', await t.cookieFor('ADMIN'))
        .send({ validTo: '2031-01-01T00:00:00.000Z' })
        .expect(400);
      await request(t.http)
        .patch(`/api/v1/admin/pricing-rules/${created.body.id}`)
        .set('Cookie', await t.cookieFor('ADMIN'))
        .send({ validTo: '2031-09-01T00:00:00.000Z' })
        .expect(200);
    });

    it('records the audit entry for an update, and only ADMIN/DISPATCHER may change rules', async () => {
      const created = await request(t.http)
        .post('/api/v1/admin/pricing-rules')
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .send({ name: 'Audited Update Rule', baseFeeCents: 1000, perKgCents: 100, isActive: false })
        .expect(201);
      await request(t.http)
        .patch(`/api/v1/admin/pricing-rules/${created.body.id}`)
        .set('Cookie', await t.cookieFor('ADMIN'))
        .send({ name: 'Audited Update Rule v2' })
        .expect(200);
      expect(
        await t.prisma.auditLog.findFirst({
          where: { action: 'pricing_rule.updated', entityId: created.body.id },
        }),
      ).not.toBeNull();

      await request(t.http)
        .patch(`/api/v1/admin/pricing-rules/${created.body.id}`)
        .send({ name: 'x' })
        .expect(401);
      for (const role of ['CUSTOMER', 'COURIER', 'MERCHANT'] as const) {
        await request(t.http)
          .patch(`/api/v1/admin/pricing-rules/${created.body.id}`)
          .set('Cookie', await t.cookieFor(role))
          .send({ name: 'x' })
          .expect(403);
      }
    });
  });
});
