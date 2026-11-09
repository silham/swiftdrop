import request from 'supertest';
import { ERROR_CODES, type ParcelStatus } from '@swiftdrop/contracts';
import type { Parcel, User } from '@swiftdrop/db';
import { DispatchService } from '../../src/modules/dispatch';
import { ParcelsService } from '../../src/modules/parcels';
import { createTestApp, type TestContext } from '../utils/app';

/** Smallest valid PNG header; the API checks magic bytes, not the full image. */
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0,
]);

describe('Courier workflow (Integration)', () => {
  let t: TestContext;
  let parcels: ParcelsService;
  let dispatch: DispatchService;
  let courier1: User;
  let courier2: User;
  let dispatcher: User;
  let customer: User;
  let c1: string;
  let c2: string;

  beforeAll(async () => {
    t = await createTestApp();
    parcels = t.app.get(ParcelsService);
    dispatch = t.app.get(DispatchService);
    // This suite gets its own customer and couriers so it can't change what other suites see
    // (the seeded demo users' parcel lists and courier capacity). The "zz-" prefix keeps them last
    // in cookieFor()'s alphabetical lookups.
    const makeUser = async (email: string, name: string, role: 'COURIER' | 'CUSTOMER') =>
      t.prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name, role, phone: '+94770000000' },
      });
    courier1 = await makeUser('zz-courier-suite-a@swiftdrop.test', 'Suite Courier A', 'COURIER');
    courier2 = await makeUser('zz-courier-suite-b@swiftdrop.test', 'Suite Courier B', 'COURIER');
    customer = await makeUser('zz-customer-suite@swiftdrop.test', 'Suite Customer', 'CUSTOMER');
    dispatcher = await t.prisma.user.findUniqueOrThrow({
      where: { email: 'dispatcher@swiftdrop.test' },
    });
    for (const courier of [courier1, courier2]) {
      await t.prisma.courierProfile.upsert({
        where: { userId: courier.id },
        update: { isAvailable: true, maxActiveParcels: 100 },
        create: { userId: courier.id, isAvailable: true, maxActiveParcels: 100 },
      });
    }
    c1 = await t.cookieFor('COURIER', courier1.email);
    c2 = await t.cookieFor('COURIER', courier2.email);
  });

  afterAll(() => t.close());

  /** A customer parcel assigned to courier1 and moved to `status` by courier1. */
  async function assignedParcel(status: ParcelStatus = 'CREATED'): Promise<Parcel> {
    const parcel = await parcels.create(
      {
        source: 'CUSTOMER',
        customerId: customer.id,
        senderName: 'Courier Suite Sender',
        senderPhone: '+94770000001',
        pickupAddress: '10 Galle Road',
        pickupCity: 'colombo',
        recipientName: 'Courier Suite Recipient',
        recipientPhone: '+94770000002',
        dropoffAddress: '20 Kandy Road',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 1.5,
      },
      'CUSTOMER',
    );
    await dispatch.assign(
      { id: dispatcher.id, email: dispatcher.email, role: 'DISPATCHER' },
      { parcelId: parcel.id, courierId: courier1.id },
    );
    const path: ParcelStatus[] = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'];
    for (const to of path.slice(0, path.indexOf(status as never) + 1)) {
      await request(t.http)
        .patch(`/api/v1/courier/parcels/${parcel.id}/status`)
        .set('Cookie', c1)
        .send({ status: to })
        .expect(200);
    }
    return parcel;
  }

  function deliver(parcelId: string, file: Buffer = PNG, name = 'proof.png') {
    return request(t.http)
      .post(`/api/v1/courier/parcels/${parcelId}/proof`)
      .set('Cookie', c1)
      .field('recipientName', 'Kamal Perera')
      .attach('photo', file, name);
  }

  describe('role checks', () => {
    it('rejects anonymous callers with 401', async () => {
      await request(t.http).get('/api/v1/courier/parcels').expect(401);
      await request(t.http).get('/api/v1/courier/history').expect(401);
    });

    it.each(['CUSTOMER', 'DISPATCHER', 'MERCHANT', 'ADMIN'] as const)(
      'rejects %s on the courier routes with 403',
      async (role) => {
        const cookie = await t.cookieFor(role);
        await request(t.http).get('/api/v1/courier/parcels').set('Cookie', cookie).expect(403);
        await request(t.http).get('/api/v1/courier/history').set('Cookie', cookie).expect(403);
      },
    );
  });

  describe('assigned parcels', () => {
    it('lists my assigned parcels with recipient contact and next actions', async () => {
      const parcel = await assignedParcel();
      const res = await request(t.http)
        .get('/api/v1/courier/parcels')
        .set('Cookie', c1)
        .expect(200);
      const mine = res.body.find((p: { id: string }) => p.id === parcel.id);
      expect(mine).toMatchObject({
        trackingNumber: parcel.trackingNumber,
        status: 'CREATED',
        recipientName: 'Courier Suite Recipient',
        recipientPhone: '+94770000002',
        nextStatuses: ['PICKED_UP'],
        canDeliver: false,
      });

      const other = await request(t.http)
        .get('/api/v1/courier/parcels')
        .set('Cookie', c2)
        .expect(200);
      expect(other.body.find((p: { id: string }) => p.id === parcel.id)).toBeUndefined();
    });

    it("courier2 cannot see or update courier1's parcel (404)", async () => {
      const parcel = await assignedParcel();
      await request(t.http)
        .get(`/api/v1/courier/parcels/${parcel.id}`)
        .set('Cookie', c2)
        .expect(404);
      await request(t.http)
        .patch(`/api/v1/courier/parcels/${parcel.id}/status`)
        .set('Cookie', c2)
        .send({ status: 'PICKED_UP' })
        .expect(404);
      const unchanged = await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } });
      expect(unchanged.status).toBe('CREATED');
    });

    it('returns 404 for a parcel that is not assigned to anyone', async () => {
      const res = await request(t.http)
        .get('/api/v1/courier/parcels/does-not-exist')
        .set('Cookie', c1)
        .expect(404);
      expect(res.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
      const seeded = await t.prisma.parcel.findUniqueOrThrow({
        where: { trackingNumber: 'SD100000001' },
      });
      await request(t.http)
        .get(`/api/v1/courier/parcels/${seeded.id}`)
        .set('Cookie', c1)
        .expect(404);
    });
  });

  describe('status updates', () => {
    it('a valid update writes a history row and an outbox event', async () => {
      const parcel = await assignedParcel();
      const res = await request(t.http)
        .patch(`/api/v1/courier/parcels/${parcel.id}/status`)
        .set('Cookie', c1)
        .send({ status: 'PICKED_UP' })
        .expect(200);
      expect(res.body.status).toBe('PICKED_UP');
      expect(res.body.nextStatuses).toEqual(['IN_TRANSIT']);

      const history = await t.prisma.parcelStatusHistory.findFirst({
        where: { parcelId: parcel.id, toStatus: 'PICKED_UP' },
      });
      expect(history).toMatchObject({ actorId: courier1.id, actorRole: 'COURIER' });
      const event = await t.prisma.outboxEvent.findFirst({
        where: {
          eventType: 'parcel.status_changed',
          payload: { path: ['data', 'parcelId'], equals: parcel.id },
        },
      });
      expect(event).not.toBeNull();
    });

    it('rejects a skipped step with 409 and DELIVERED with 400 (proof endpoint only)', async () => {
      const parcel = await assignedParcel();
      const skip = await request(t.http)
        .patch(`/api/v1/courier/parcels/${parcel.id}/status`)
        .set('Cookie', c1)
        .send({ status: 'OUT_FOR_DELIVERY' })
        .expect(409);
      expect(skip.body.error.code).toBe(ERROR_CODES.INVALID_STATUS_TRANSITION);
      await request(t.http)
        .patch(`/api/v1/courier/parcels/${parcel.id}/status`)
        .set('Cookie', c1)
        .send({ status: 'DELIVERED' })
        .expect(400);
    });

    it('FAILED without a reason → 422', async () => {
      const parcel = await assignedParcel('OUT_FOR_DELIVERY');
      const res = await request(t.http)
        .patch(`/api/v1/courier/parcels/${parcel.id}/status`)
        .set('Cookie', c1)
        .send({ status: 'FAILED' })
        .expect(422);
      expect(res.body.error.code).toBe(ERROR_CODES.FAILURE_REASON_REQUIRED);
    });

    it('the same courier can re-attempt a failed parcel; the last failure closes the assignment', async () => {
      const parcel = await assignedParcel('OUT_FOR_DELIVERY');
      const patch = (body: object) =>
        request(t.http)
          .patch(`/api/v1/courier/parcels/${parcel.id}/status`)
          .set('Cookie', c1)
          .send(body);

      // Attempts 1 and 2 fail; the courier keeps the parcel and re-attempts.
      for (let attempt = 1; attempt <= 2; attempt++) {
        const failed = await patch({ status: 'FAILED', failureReason: 'RECIPIENT_UNAVAILABLE' });
        expect(failed.status).toBe(200);
        expect(failed.body.nextStatuses).toEqual(['OUT_FOR_DELIVERY']);
        expect(await dispatch.getActiveAssignment(parcel.id)).not.toBeNull();
        await patch({ status: 'OUT_FOR_DELIVERY' }).expect(200);
      }

      // Attempt 3 fails: no attempts left, so the assignment is completed.
      const last = await patch({ status: 'FAILED', failureReason: 'ADDRESS_NOT_FOUND' }).expect(
        200,
      );
      expect(last.body).toMatchObject({ status: 'FAILED', deliveryAttempts: 3, nextStatuses: [] });
      expect(await dispatch.getActiveAssignment(parcel.id)).toBeNull();

      // It shows up in my history, and dispatch can no longer assign it.
      const history = await request(t.http)
        .get('/api/v1/courier/history')
        .set('Cookie', c1)
        .expect(200);
      expect(
        history.body.data.find((h: { parcelId: string }) => h.parcelId === parcel.id),
      ).toMatchObject({ status: 'FAILED' });
      const reassign = await request(t.http)
        .post('/api/v1/dispatch/assignments')
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .send({ parcelId: parcel.id, courierId: courier2.id })
        .expect(409);
      expect(reassign.body.error.code).toBe(ERROR_CODES.MAX_ATTEMPTS_REACHED);
    });

    it('a dispatcher can unassign a failed parcel and give it to another courier', async () => {
      const parcel = await assignedParcel('OUT_FOR_DELIVERY');
      await request(t.http)
        .patch(`/api/v1/courier/parcels/${parcel.id}/status`)
        .set('Cookie', c1)
        .send({ status: 'FAILED', failureReason: 'REFUSED' })
        .expect(200);
      const assignment = await dispatch.getActiveAssignment(parcel.id);
      const dispatcherCookie = await t.cookieFor('DISPATCHER');

      await request(t.http)
        .delete(`/api/v1/dispatch/assignments/${assignment!.id}`)
        .set('Cookie', dispatcherCookie)
        .expect(200);
      await request(t.http)
        .post('/api/v1/dispatch/assignments')
        .set('Cookie', dispatcherCookie)
        .send({ parcelId: parcel.id, courierId: courier2.id })
        .expect(201);

      await request(t.http)
        .get(`/api/v1/courier/parcels/${parcel.id}`)
        .set('Cookie', c1)
        .expect(404);
      const res = await request(t.http)
        .get(`/api/v1/courier/parcels/${parcel.id}`)
        .set('Cookie', c2)
        .expect(200);
      expect(res.body.nextStatuses).toEqual(['OUT_FOR_DELIVERY']);
    });
  });

  describe('proof of delivery', () => {
    it('a PNG proof marks the parcel DELIVERED, stores the proof and completes the assignment', async () => {
      const parcel = await assignedParcel('OUT_FOR_DELIVERY');
      const res = await deliver(parcel.id).expect(201);
      expect(res.body).toMatchObject({ status: 'DELIVERED', nextStatuses: [], canDeliver: false });

      const proof = await t.prisma.proofOfDelivery.findUniqueOrThrow({
        where: { parcelId: parcel.id },
      });
      expect(proof).toMatchObject({ courierId: courier1.id, recipientName: 'Kamal Perera' });
      expect(proof.photoKey).toMatch(new RegExp(`^pod/${parcel.id}/[0-9a-f-]+\\.png$`));
      const assignment = await t.prisma.courierAssignment.findFirstOrThrow({
        where: { parcelId: parcel.id },
      });
      expect(assignment.status).toBe('COMPLETED');
      expect(assignment.completedAt).not.toBeNull();
      const updated = await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } });
      expect(updated.deliveredAt).not.toBeNull();
    });

    it('a text file renamed .jpg → 400 UNSUPPORTED_FILE, and nothing changes', async () => {
      const parcel = await assignedParcel('OUT_FOR_DELIVERY');
      const res = await deliver(
        parcel.id,
        Buffer.from('hello, I am a text file pretending to be a photo'),
        'photo.jpg',
      ).expect(400);
      expect(res.body.error.code).toBe(ERROR_CODES.UNSUPPORTED_FILE);
      const unchanged = await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } });
      expect(unchanged.status).toBe('OUT_FOR_DELIVERY');
    });

    it('a photo over 5 MB → 413 FILE_TOO_LARGE', async () => {
      const parcel = await assignedParcel('OUT_FOR_DELIVERY');
      const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1)]);
      const res = await deliver(parcel.id, big).expect(413);
      expect(res.body.error.code).toBe(ERROR_CODES.FILE_TOO_LARGE);
    });

    it('no photo → 422 PROOF_REQUIRED', async () => {
      const parcel = await assignedParcel('OUT_FOR_DELIVERY');
      const res = await request(t.http)
        .post(`/api/v1/courier/parcels/${parcel.id}/proof`)
        .set('Cookie', c1)
        .field('recipientName', 'Kamal Perera')
        .expect(422);
      expect(res.body.error.code).toBe(ERROR_CODES.PROOF_REQUIRED);
    });

    it('proof before the parcel is out for delivery → 409', async () => {
      const parcel = await assignedParcel('IN_TRANSIT');
      const res = await deliver(parcel.id).expect(409);
      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_STATUS_TRANSITION);
    });

    it('courier2 cannot deliver a parcel assigned to courier1 (404)', async () => {
      const parcel = await assignedParcel('OUT_FOR_DELIVERY');
      await request(t.http)
        .post(`/api/v1/courier/parcels/${parcel.id}/proof`)
        .set('Cookie', c2)
        .field('recipientName', 'Kamal Perera')
        .attach('photo', PNG, 'proof.png')
        .expect(404);
    });
  });

  describe('proof photo viewing', () => {
    let parcelId: string;

    beforeAll(async () => {
      const parcel = await assignedParcel('OUT_FOR_DELIVERY');
      await deliver(parcel.id).expect(201);
      parcelId = parcel.id;
    });

    it('the owning customer can view the photo, with a no-store cache header', async () => {
      const res = await request(t.http)
        .get(`/api/v1/parcels/${parcelId}/proof/photo`)
        .set('Cookie', await t.cookieFor('CUSTOMER', customer.email))
        .expect(200);
      expect(res.headers['content-type']).toMatch(/^image\/png/);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(Buffer.from(res.body).subarray(0, 8)).toEqual(PNG.subarray(0, 8));
    });

    it('another customer gets 404', async () => {
      await request(t.http)
        .get(`/api/v1/parcels/${parcelId}/proof/photo`)
        .set('Cookie', await t.cookieFor('CUSTOMER', 'customer2@swiftdrop.test'))
        .expect(404);
    });

    it('the dispatcher and the delivering courier can view it; another courier cannot', async () => {
      await request(t.http)
        .get(`/api/v1/parcels/${parcelId}/proof/photo`)
        .set('Cookie', await t.cookieFor('DISPATCHER'))
        .expect(200);
      await request(t.http)
        .get(`/api/v1/parcels/${parcelId}/proof/photo`)
        .set('Cookie', c1)
        .expect(200);
      await request(t.http)
        .get(`/api/v1/parcels/${parcelId}/proof/photo`)
        .set('Cookie', c2)
        .expect(404);
    });

    it('merchants are not allowed (403), anonymous callers get 401', async () => {
      await request(t.http)
        .get(`/api/v1/parcels/${parcelId}/proof/photo`)
        .set('Cookie', await t.cookieFor('MERCHANT'))
        .expect(403);
      await request(t.http).get(`/api/v1/parcels/${parcelId}/proof/photo`).expect(401);
    });

    it('the courier can still open the delivered parcel; another courier cannot', async () => {
      const res = await request(t.http)
        .get(`/api/v1/courier/parcels/${parcelId}`)
        .set('Cookie', c1)
        .expect(200);
      expect(res.body).toMatchObject({ status: 'DELIVERED', nextStatuses: [], canDeliver: false });
      await request(t.http)
        .get(`/api/v1/courier/parcels/${parcelId}`)
        .set('Cookie', c2)
        .expect(404);
      // ...but it can no longer be changed.
      await request(t.http)
        .patch(`/api/v1/courier/parcels/${parcelId}/status`)
        .set('Cookie', c1)
        .send({ status: 'FAILED', failureReason: 'OTHER' })
        .expect(404);
    });

    it('shows up in the courier history as DELIVERED', async () => {
      const res = await request(t.http)
        .get('/api/v1/courier/history?pageSize=50')
        .set('Cookie', c1)
        .expect(200);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 50 });
      expect(
        res.body.data.find((h: { parcelId: string }) => h.parcelId === parcelId),
      ).toMatchObject({ status: 'DELIVERED', deliveredAt: expect.any(String) });
    });
  });
});
