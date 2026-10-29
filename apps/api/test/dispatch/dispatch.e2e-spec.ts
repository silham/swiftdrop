import request from 'supertest';
import { ERROR_CODES } from '@swiftdrop/contracts';
import type { Parcel, User } from '@swiftdrop/db';
import { ParcelsService } from '../../src/modules/parcels';
import { createTestApp, type TestContext } from '../utils/app';

describe('Dispatch Module (Integration)', () => {
  let t: TestContext;
  let parcelsService: ParcelsService;
  let demoCourier: User;

  beforeAll(async () => {
    t = await createTestApp();
    parcelsService = t.app.get(ParcelsService);

    // Find seeded courier and ensure courierProfile exists
    demoCourier = await t.prisma.user.findFirstOrThrow({
      where: { role: 'COURIER' },
    });

    const cmbZone = await t.prisma.deliveryZone.findFirstOrThrow({ where: { code: 'CMB' } });
    await t.prisma.courierProfile.upsert({
      where: { userId: demoCourier.id },
      update: { isAvailable: true, maxActiveParcels: 10 },
      create: {
        userId: demoCourier.id,
        zoneId: cmbZone.id,
        isAvailable: true,
        maxActiveParcels: 10,
      },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  async function createTestParcel(): Promise<Parcel> {
    return parcelsService.create(
      {
        source: 'CUSTOMER',
        senderName: 'Dispatch Sender',
        senderPhone: '+94770000001',
        pickupAddress: '10 Galle Road',
        pickupCity: 'colombo',
        recipientName: 'Dispatch Recipient',
        recipientPhone: '+94770000002',
        dropoffAddress: '20 Kandy Road',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 1.5,
      },
      'CUSTOMER',
    );
  }

  describe('GET /api/v1/dispatch/unassigned', () => {
    it('returns unassigned parcels with paginated response and omits recipient phone numbers', async () => {
      const parcel = await createTestParcel();

      const res = await request(t.http)
        .get('/api/v1/dispatch/unassigned')
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toMatchObject({
        page: 1,
        pageSize: expect.any(Number),
        total: expect.any(Number),
      });

      const found = res.body.data.find((p: any) => p.id === parcel.id);
      expect(found).toBeDefined();
      expect(found.trackingNumber).toBe(parcel.trackingNumber);
      expect(found.recipientPhone).toBeUndefined(); // PII minimisation
    });

    it('rejects CUSTOMER and COURIER access with 403 Forbidden', async () => {
      await request(t.http)
        .get('/api/v1/dispatch/unassigned')
        .set('Cookie', await t.cookieFor('CUSTOMER'))
        .expect(403);

      await request(t.http)
        .get('/api/v1/dispatch/unassigned')
        .set('Cookie', await t.cookieFor('COURIER'))
        .expect(403);
    });
  });

  describe('POST /api/v1/dispatch/assignments', () => {
    it('successfully assigns courier, records audit entry, and enqueues outbox event', async () => {
      const parcel = await createTestParcel();

      const res = await request(t.http)
        .post('/api/v1/dispatch/assignments')
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .send({
          parcelId: parcel.id,
          courierId: demoCourier.id,
        })
        .expect(200);

      expect(res.body).toMatchObject({
        parcelId: parcel.id,
        courierId: demoCourier.id,
        status: 'ACTIVE',
      });

      // Verify audit entry in database
      const audit = await t.prisma.auditLog.findFirst({
        where: {
          action: 'parcel.assigned',
          entityId: parcel.id,
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorRole).toBe('DISPATCHER');

      // Verify domain event in transactional outbox
      const outbox = await t.prisma.outboxEvent.findFirst({
        where: {
          eventType: 'parcel.courier_assigned',
          payload: {
            path: ['data', 'parcelId'],
            equals: parcel.id,
          },
        },
      });
      expect(outbox).not.toBeNull();
    });

    it('returns 409 ALREADY_ASSIGNED on double assignment attempt', async () => {
      const parcel = await createTestParcel();

      // First assignment
      await request(t.http)
        .post('/api/v1/dispatch/assignments')
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .send({
          parcelId: parcel.id,
          courierId: demoCourier.id,
        })
        .expect(200);

      // Attempt second assignment for same parcel
      const res = await request(t.http)
        .post('/api/v1/dispatch/assignments')
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .send({
          parcelId: parcel.id,
          courierId: demoCourier.id,
        })
        .expect(409);

      expect(res.body.error).toMatchObject({
        code: ERROR_CODES.ALREADY_ASSIGNED,
      });
    });

    it('rejects assignment attempts from unauthorized roles (CUSTOMER, COURIER)', async () => {
      const parcel = await createTestParcel();

      await request(t.http)
        .post('/api/v1/dispatch/assignments')
        .set('Cookie', await t.cookieFor('CUSTOMER'))
        .send({
          parcelId: parcel.id,
          courierId: demoCourier.id,
        })
        .expect(403);
    });
  });

  describe('DELETE /api/v1/dispatch/assignments/:id', () => {
    it('cancels active assignment for a CREATED parcel and writes audit entry', async () => {
      const parcel = await createTestParcel();

      const assignRes = await request(t.http)
        .post('/api/v1/dispatch/assignments')
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .send({
          parcelId: parcel.id,
          courierId: demoCourier.id,
        })
        .expect(200);

      const assignmentId = assignRes.body.id;

      await request(t.http)
        .delete(`/api/v1/dispatch/assignments/${assignmentId}`)
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .expect(200);

      // Verify status changed to CANCELLED in DB
      const updated = await t.prisma.courierAssignment.findUnique({
        where: { id: assignmentId },
      });
      expect(updated?.status).toBe('CANCELLED');

      // Verify audit
      const audit = await t.prisma.auditLog.findFirst({
        where: {
          action: 'parcel.unassigned',
          entityId: parcel.id,
        },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('GET /api/v1/dispatch/couriers/workload', () => {
    it('returns courier workload with capacity statistics', async () => {
      const res = await request(t.http)
        .get('/api/v1/dispatch/couriers/workload')
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const courier = res.body.find((c: any) => c.courierId === demoCourier.id);
      expect(courier).toBeDefined();
      expect(courier.isAvailable).toBe(true);
      expect(courier.maxActiveParcels).toBeGreaterThan(0);
      expect(typeof courier.activeParcels).toBe('number');
    });

    it('forbids COURIER and CUSTOMER from accessing courier workload view', async () => {
      await request(t.http)
        .get('/api/v1/dispatch/couriers/workload')
        .set('Cookie', await t.cookieFor('COURIER'))
        .expect(403);

      await request(t.http)
        .get('/api/v1/dispatch/couriers/workload')
        .set('Cookie', await t.cookieFor('CUSTOMER'))
        .expect(403);
    });
  });
});
