import * as crypto from 'crypto';
import request from 'supertest';
import { ERROR_CODES, MERCHANT_API_KEY_HEADER } from '@swiftdrop/contracts';
import { createTestApp, type TestContext } from '../utils/app';

describe('Partner API Engine (/api/v1/merchant/*) — Task Group 3 (integration)', () => {
  let t: TestContext;

  // Merchant A (Approved demo merchant)
  let merchantAId: string;
  let rawKeyA: string;
  let revokedKeyA: string;

  // Merchant B (Another approved merchant for cross-merchant tests)
  let merchantBId: string;

  // Merchant C (Pending merchant)
  let rawKeyPending: string;

  // Seeded parcels
  const trackingParcelA = 'SD900000001';
  const trackingParcelB = 'SD900000002';
  const merchantRefA = 'ORDER-REF-AAA';
  const merchantRefB = 'ORDER-REF-BBB';

  beforeAll(async () => {
    t = await createTestApp();

    // 1. Get Merchant A (Demo merchant: Lanka Books)
    const merchantA = await t.prisma.merchant.findFirstOrThrow({
      where: { contactEmail: 'merchant@swiftdrop.test' },
    });
    merchantAId = merchantA.id;

    // Helper to create an API key directly in DB
    const generateKeyRecord = async (
      merchantId: string,
      name: string,
      isRevoked = false,
    ): Promise<string> => {
      const prefix = `sd_live_${crypto.randomBytes(4).toString('hex')}`;
      const secret = crypto.randomBytes(32).toString('base64url');
      const raw = `${prefix}_${secret}`;
      const keyHash = crypto.createHash('sha256').update(raw).digest('hex');

      await t.prisma.apiKey.create({
        data: {
          merchantId,
          name,
          prefix,
          keyHash,
          revokedAt: isRevoked ? new Date() : null,
        },
      });

      return raw;
    };

    rawKeyA = await generateKeyRecord(merchantAId, 'Merchant A Valid Key');
    revokedKeyA = await generateKeyRecord(merchantAId, 'Merchant A Revoked Key', true);

    // 2. Create Merchant B (Approved)
    const userB = await t.prisma.user.create({
      data: {
        email: `merchant-b-${Date.now()}@swiftdrop.test`,
        name: 'Merchant B Owner',
        role: 'MERCHANT',
      },
    });
    const merchantB = await t.prisma.merchant.create({
      data: {
        ownerUserId: userB.id,
        businessName: 'Merchant B Enterprise',
        contactEmail: userB.email,
        status: 'APPROVED',
      },
    });
    merchantBId = merchantB.id;
    await generateKeyRecord(merchantBId, 'Merchant B Valid Key');

    // 3. Create Merchant C (Pending)
    const userPending = await t.prisma.user.create({
      data: {
        email: `merchant-pending-${Date.now()}@swiftdrop.test`,
        name: 'Pending Owner',
        role: 'MERCHANT',
      },
    });
    const merchantPending = await t.prisma.merchant.create({
      data: {
        ownerUserId: userPending.id,
        businessName: 'Unapproved Startup',
        contactEmail: userPending.email,
        status: 'PENDING',
      },
    });
    rawKeyPending = await generateKeyRecord(merchantPending.id, 'Pending Key');

    // 4. Seed parcels for Merchant A and Merchant B
    await t.prisma.parcel.create({
      data: {
        trackingNumber: trackingParcelA,
        status: 'CREATED',
        source: 'MERCHANT_API',
        merchantId: merchantAId,
        merchantReference: merchantRefA,
        senderName: 'Merchant A',
        senderPhone: '+94771111111',
        pickupAddress: '10 Galle Road',
        pickupCity: 'colombo',
        recipientName: 'Customer One',
        recipientPhone: '+94772222222',
        dropoffAddress: '20 Kandy Road',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 1.0,
        feeCents: 45000,
        currency: 'LKR',
      },
    });

    await t.prisma.parcel.create({
      data: {
        trackingNumber: trackingParcelB,
        status: 'CREATED',
        source: 'MERCHANT_API',
        merchantId: merchantBId,
        merchantReference: merchantRefB,
        senderName: 'Merchant B',
        senderPhone: '+94773333333',
        pickupAddress: '50 Main Street',
        pickupCity: 'jaffna',
        recipientName: 'Customer Two',
        recipientPhone: '+94774444444',
        dropoffAddress: '60 Station Road',
        dropoffCity: 'colombo',
        size: 'MEDIUM',
        weightKg: 2.5,
        feeCents: 75000,
        currency: 'LKR',
      },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  describe('Authentication via X-Api-Key Header (ApiKeyGuard)', () => {
    it('rejects requests with missing X-Api-Key with 401', async () => {
      const res = await request(t.http).get('/api/v1/merchant/parcels').expect(401);

      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_API_KEY);
    });

    it('rejects requests with invalid key format or non-existent key with 401', async () => {
      const res = await request(t.http)
        .get('/api/v1/merchant/parcels')
        .set(MERCHANT_API_KEY_HEADER, 'sd_live_invalidkey_secret123')
        .expect(401);

      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_API_KEY);
    });

    it('rejects requests with revoked API key with 401', async () => {
      const res = await request(t.http)
        .get('/api/v1/merchant/parcels')
        .set(MERCHANT_API_KEY_HEADER, revokedKeyA)
        .expect(401);

      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_API_KEY);
    });

    it('rejects API key of a PENDING merchant with 403 MERCHANT_NOT_APPROVED', async () => {
      const res = await request(t.http)
        .get('/api/v1/merchant/parcels')
        .set(MERCHANT_API_KEY_HEADER, rawKeyPending)
        .expect(403);

      expect(res.body.error.code).toBe(ERROR_CODES.MERCHANT_NOT_APPROVED);
    });

    it('authenticates valid key of approved merchant and updates lastUsedAt', async () => {
      await request(t.http)
        .get('/api/v1/merchant/parcels')
        .set(MERCHANT_API_KEY_HEADER, rawKeyA)
        .expect(200);

      const prefix = rawKeyA.split('_').slice(0, 3).join('_');
      const dbKey = await t.prisma.apiKey.findUnique({ where: { prefix } });
      expect(dbKey?.lastUsedAt).toBeDefined();
    });
  });

  describe('GET /api/v1/merchant/parcels (List Own Parcels)', () => {
    it('returns only parcels belonging to the calling merchant', async () => {
      const res = await request(t.http)
        .get('/api/v1/merchant/parcels')
        .set(MERCHANT_API_KEY_HEADER, rawKeyA)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();

      const trackingNumbers = res.body.data.map((p: any) => p.trackingNumber);
      expect(trackingNumbers).toContain(trackingParcelA);
      // Ensure Merchant B's parcel is NOT present
      expect(trackingNumbers).not.toContain(trackingParcelB);
    });
  });

  describe('GET /api/v1/merchant/parcels/:trackingNumber (Cross-Merchant Security)', () => {
    it('allows merchant to fetch their own parcel by tracking number', async () => {
      const res = await request(t.http)
        .get(`/api/v1/merchant/parcels/${trackingParcelA}`)
        .set(MERCHANT_API_KEY_HEADER, rawKeyA)
        .expect(200);

      expect(res.body.trackingNumber).toBe(trackingParcelA);
      expect(res.body.senderName).toBe('Merchant A');
    });

    it("returns 404 when Merchant A's key attempts to query Merchant B's parcel", async () => {
      const res = await request(t.http)
        .get(`/api/v1/merchant/parcels/${trackingParcelB}`)
        .set(MERCHANT_API_KEY_HEADER, rawKeyA)
        .expect(404);

      expect(res.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    });

    it('returns 404 for non-existent tracking number', async () => {
      await request(t.http)
        .get('/api/v1/merchant/parcels/SD999999999')
        .set(MERCHANT_API_KEY_HEADER, rawKeyA)
        .expect(404);
    });
  });

  describe('POST /api/v1/merchant/parcels (Idempotent Creation & Validation)', () => {
    it('returns 200 with existing parcel when merchantReference already exists (idempotency)', async () => {
      const res = await request(t.http)
        .post('/api/v1/merchant/parcels')
        .set(MERCHANT_API_KEY_HEADER, rawKeyA)
        .send({
          merchantReference: merchantRefA,
          senderName: 'Merchant A',
          senderPhone: '+94771111111',
          pickupAddress: '10 Galle Road',
          pickupCity: 'colombo',
          recipientName: 'Customer One',
          recipientPhone: '+94772222222',
          dropoffAddress: '20 Kandy Road',
          dropoffCity: 'kandy',
          size: 'SMALL',
          weightKg: 1.0,
        })
        .expect(200);

      expect(res.body.trackingNumber).toBe(trackingParcelA);
    });

    it('rejects requests containing a forged merchantId in the body with 400', async () => {
      await request(t.http)
        .post('/api/v1/merchant/parcels')
        .set(MERCHANT_API_KEY_HEADER, rawKeyA)
        .send({
          merchantId: 'forged_merchant_id',
          merchantReference: 'ORDER-NEW-001',
          senderName: 'Merchant A',
          senderPhone: '+94771111111',
          pickupAddress: '10 Galle Road',
          pickupCity: 'colombo',
          recipientName: 'Customer One',
          recipientPhone: '+94772222222',
          dropoffAddress: '20 Kandy Road',
          dropoffCity: 'kandy',
          size: 'SMALL',
          weightKg: 1.0,
        })
        .expect(400);
    });

    it('validates required fields on parcel creation', async () => {
      await request(t.http)
        .post('/api/v1/merchant/parcels')
        .set(MERCHANT_API_KEY_HEADER, rawKeyA)
        .send({
          merchantReference: '', // too short
          senderName: 'A',
          weightKg: -5, // invalid weight
        })
        .expect(400);
    });
  });
});
