import request from 'supertest';
import { ERROR_CODES } from '@swiftdrop/contracts';
import { createTestApp, type TestContext } from '../utils/app';

describe('merchants module — Tasks 1 & 2 (integration)', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('Task Group 1: Registration & Admin Approval', () => {
    describe('POST /api/v1/merchants/register', () => {
      it('registers a new merchant account in PENDING status', async () => {
        const email = `merchant-test-${Date.now()}@swiftdrop.test`;
        const res = await request(t.http)
          .post('/api/v1/merchants/register')
          .send({
            businessName: 'Apex Books & Stationery',
            contactName: 'Nimal Perera',
            email,
            password: 'Password123!',
            contactPhone: '+94771234567',
          })
          .expect(201);

        expect(res.body).toMatchObject({
          businessName: 'Apex Books & Stationery',
          contactEmail: email,
          status: 'PENDING',
        });
        expect(res.body.id).toBeDefined();

        // Check DB
        const dbMerchant = await t.prisma.merchant.findUnique({
          where: { id: res.body.id },
          include: { owner: true },
        });
        expect(dbMerchant).toBeDefined();
        expect(dbMerchant?.status).toBe('PENDING');
        expect(dbMerchant?.owner.role).toBe('MERCHANT');
        expect(dbMerchant?.owner.email).toBe(email);
      });

      it('rejects duplicate email with 409 EMAIL_TAKEN', async () => {
        const email = `merchant-dup-${Date.now()}@swiftdrop.test`;
        await request(t.http)
          .post('/api/v1/merchants/register')
          .send({
            businessName: 'Shop One',
            contactName: 'Shop Owner',
            email,
            password: 'Password123!',
          })
          .expect(201);

        const dupRes = await request(t.http)
          .post('/api/v1/merchants/register')
          .send({
            businessName: 'Shop Two',
            contactName: 'Another Owner',
            email,
            password: 'Password123!',
          })
          .expect(409);

        expect(dupRes.body.error.code).toBe(ERROR_CODES.EMAIL_TAKEN);
      });

      it('validates input fields', async () => {
        await request(t.http)
          .post('/api/v1/merchants/register')
          .send({
            businessName: 'A', // too short (< 2)
            contactName: '',
            email: 'not-an-email',
            password: 'short', // < 8
          })
          .expect(400);
      });
    });

    describe('GET /api/v1/merchants/me', () => {
      it('returns the authenticated merchant profile', async () => {
        const cookie = await t.cookieFor('MERCHANT', 'merchant@swiftdrop.test');
        const res = await request(t.http)
          .get('/api/v1/merchants/me')
          .set('Cookie', cookie)
          .expect(200);

        expect(res.body).toMatchObject({
          businessName: 'Lanka Books (Demo)',
          contactEmail: 'merchant@swiftdrop.test',
          status: 'APPROVED',
        });
      });

      it('rejects non-merchant roles with 403 Forbidden', async () => {
        const customerCookie = await t.cookieFor('CUSTOMER');
        await request(t.http)
          .get('/api/v1/merchants/me')
          .set('Cookie', customerCookie)
          .expect(403);
      });

      it('rejects unauthenticated requests with 401', async () => {
        await request(t.http).get('/api/v1/merchants/me').expect(401);
      });
    });

    describe('Admin Merchant Management (/api/v1/admin/merchants)', () => {
      let pendingMerchantId: string;
      let pendingEmail: string;

      beforeEach(async () => {
        pendingEmail = `admin-test-${Date.now()}-${Math.random().toString(36).substring(7)}@swiftdrop.test`;
        const reg = await request(t.http)
          .post('/api/v1/merchants/register')
          .send({
            businessName: 'Pending Goods Ltd',
            contactName: 'Sunil Silva',
            email: pendingEmail,
            password: 'Password123!',
          })
          .expect(201);
        pendingMerchantId = reg.body.id;
      });

      it('rejects non-admin access to admin endpoints with 403', async () => {
        const merchantCookie = await t.cookieFor('MERCHANT');
        await request(t.http)
          .get('/api/v1/admin/merchants')
          .set('Cookie', merchantCookie)
          .expect(403);

        await request(t.http)
          .post(`/api/v1/admin/merchants/${pendingMerchantId}/approve`)
          .set('Cookie', merchantCookie)
          .expect(403);
      });

      it('allows admin to list merchants and filter by status', async () => {
        const adminCookie = await t.cookieFor('ADMIN');
        const res = await request(t.http)
          .get('/api/v1/admin/merchants?status=PENDING')
          .set('Cookie', adminCookie)
          .expect(200);

        expect(res.body.data).toBeDefined();
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.meta).toBeDefined();

        const found = res.body.data.find((m: any) => m.id === pendingMerchantId);
        expect(found).toBeDefined();
        expect(found.status).toBe('PENDING');
      });

      it('allows admin to approve a merchant and writes an audit log', async () => {
        const adminCookie = await t.cookieFor('ADMIN');
        const res = await request(t.http)
          .post(`/api/v1/admin/merchants/${pendingMerchantId}/approve`)
          .set('Cookie', adminCookie)
          .expect(200);

        expect(res.body.status).toBe('APPROVED');
        expect(res.body.approvedAt).toBeDefined();

        const dbMerchant = await t.prisma.merchant.findUnique({
          where: { id: pendingMerchantId },
        });
        expect(dbMerchant?.status).toBe('APPROVED');

        const auditLog = await t.prisma.auditLog.findFirst({
          where: {
            action: 'merchant.approved',
            entityId: pendingMerchantId,
          },
        });
        expect(auditLog).toBeDefined();
        expect(auditLog?.actorRole).toBe('ADMIN');
      });

      it('allows admin to reject a merchant with reason and writes an audit log', async () => {
        const adminCookie = await t.cookieFor('ADMIN');
        const res = await request(t.http)
          .post(`/api/v1/admin/merchants/${pendingMerchantId}/reject`)
          .set('Cookie', adminCookie)
          .send({ reason: 'Business registration document invalid' })
          .expect(200);

        expect(res.body.status).toBe('REJECTED');

        const auditLog = await t.prisma.auditLog.findFirst({
          where: {
            action: 'merchant.rejected',
            entityId: pendingMerchantId,
          },
        });
        expect(auditLog).toBeDefined();
        expect((auditLog?.metadata as any)?.reason).toBe('Business registration document invalid');
      });

      it('allows admin to suspend a merchant and writes an audit log', async () => {
        const adminCookie = await t.cookieFor('ADMIN');
        const res = await request(t.http)
          .post(`/api/v1/admin/merchants/${pendingMerchantId}/suspend`)
          .set('Cookie', adminCookie)
          .expect(200);

        expect(res.body.status).toBe('SUSPENDED');

        const auditLog = await t.prisma.auditLog.findFirst({
          where: {
            action: 'merchant.suspended',
            entityId: pendingMerchantId,
          },
        });
        expect(auditLog).toBeDefined();
      });

      it('returns 404 when approving a non-existent merchant', async () => {
        const adminCookie = await t.cookieFor('ADMIN');
        await request(t.http)
          .post('/api/v1/admin/merchants/non-existent-id/approve')
          .set('Cookie', adminCookie)
          .expect(404);
      });
    });
  });

  describe('Task Group 2: API Keys & Webhooks', () => {
    let merchantCookie: string;

    beforeAll(async () => {
      merchantCookie = await t.cookieFor('MERCHANT', 'merchant@swiftdrop.test');
    });

    describe('API Keys Lifecycle (/api/v1/merchants/me/api-keys)', () => {
      let createdKeyId: string;
      let rawKey: string;

      it('creates an API key, returns raw key once, and stores prefix + hash', async () => {
        const res = await request(t.http)
          .post('/api/v1/merchants/me/api-keys')
          .set('Cookie', merchantCookie)
          .send({ name: 'Integration Shop API Key' })
          .expect(201);

        expect(res.body.id).toBeDefined();
        expect(res.body.name).toBe('Integration Shop API Key');
        expect(res.body.key).toMatch(/^sd_live_[a-f0-9]{8}_[A-Za-z0-9_-]+$/);
        expect(res.body.prefix).toMatch(/^sd_live_[a-f0-9]{8}$/);

        createdKeyId = res.body.id;
        rawKey = res.body.key;

        // Verify DB
        const dbKey = await t.prisma.apiKey.findUnique({
          where: { id: createdKeyId },
        });
        expect(dbKey).toBeDefined();
        expect(dbKey?.keyHash).not.toBe(rawKey);

        // Verify audit log
        const auditLog = await t.prisma.auditLog.findFirst({
          where: { action: 'api_key.created', entityId: createdKeyId },
        });
        expect(auditLog).toBeDefined();
      });

      it('lists API keys showing only prefix, never the raw key or hash', async () => {
        const res = await request(t.http)
          .get('/api/v1/merchants/me/api-keys')
          .set('Cookie', merchantCookie)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
        const found = res.body.find((k: any) => k.id === createdKeyId);
        expect(found).toBeDefined();
        expect(found.prefix).toMatch(/^sd_live_[a-f0-9]{8}$/);
        expect(found.key).toBeUndefined();
        expect(found.keyHash).toBeUndefined();
      });

      it('revokes an API key and records audit log', async () => {
        await request(t.http)
          .delete(`/api/v1/merchants/me/api-keys/${createdKeyId}`)
          .set('Cookie', merchantCookie)
          .expect(204);

        const dbKey = await t.prisma.apiKey.findUnique({
          where: { id: createdKeyId },
        });
        expect(dbKey?.revokedAt).toBeDefined();

        const auditLog = await t.prisma.auditLog.findFirst({
          where: { action: 'api_key.revoked', entityId: createdKeyId },
        });
        expect(auditLog).toBeDefined();
      });

      it('returns 404 when revoking non-existent API key', async () => {
        await request(t.http)
          .delete('/api/v1/merchants/me/api-keys/non-existent-key-id')
          .set('Cookie', merchantCookie)
          .expect(404);
      });
    });

    describe('Webhooks Lifecycle (/api/v1/merchants/me/webhooks)', () => {
      let createdEndpointId: string;
      let rawSecret: string;

      it('creates a webhook endpoint and returns raw signing secret once', async () => {
        const res = await request(t.http)
          .post('/api/v1/merchants/me/webhooks')
          .set('Cookie', merchantCookie)
          .send({
            url: 'https://webhook.site/test-endpoint',
            eventTypes: ['parcel.status_changed'],
          })
          .expect(201);

        expect(res.body.id).toBeDefined();
        expect(res.body.url).toBe('https://webhook.site/test-endpoint');
        expect(res.body.secret).toBeDefined();
        expect(res.body.isActive).toBe(true);

        createdEndpointId = res.body.id;
        rawSecret = res.body.secret;

        // Verify DB stores encrypted secret
        const dbEp = await t.prisma.webhookEndpoint.findUnique({
          where: { id: createdEndpointId },
        });
        expect(dbEp).toBeDefined();
        expect(dbEp?.secretEncrypted).not.toBe(rawSecret);
        expect(dbEp?.secretEncrypted.split(':')).toHaveLength(3);
      });

      it('lists webhooks without exposing signing secrets', async () => {
        const res = await request(t.http)
          .get('/api/v1/merchants/me/webhooks')
          .set('Cookie', merchantCookie)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
        const found = res.body.find((ep: any) => ep.id === createdEndpointId);
        expect(found).toBeDefined();
        expect(found.secret).toBeUndefined();
        expect(found.secretEncrypted).toBeUndefined();
      });

      it('updates a webhook endpoint URL and active state', async () => {
        const res = await request(t.http)
          .patch(`/api/v1/merchants/me/webhooks/${createdEndpointId}`)
          .set('Cookie', merchantCookie)
          .send({
            url: 'https://webhook.site/updated-endpoint',
            isActive: false,
          })
          .expect(200);

        expect(res.body.url).toBe('https://webhook.site/updated-endpoint');
        expect(res.body.isActive).toBe(false);
      });

      it('rotates signing secret, stores old secret in previousSecretEncrypted, and audits', async () => {
        const res = await request(t.http)
          .post(`/api/v1/merchants/me/webhooks/${createdEndpointId}/rotate-secret`)
          .set('Cookie', merchantCookie)
          .expect(200);

        expect(res.body.secret).toBeDefined();
        expect(res.body.secret).not.toBe(rawSecret);

        const dbEp = await t.prisma.webhookEndpoint.findUnique({
          where: { id: createdEndpointId },
        });
        expect(dbEp?.previousSecretEncrypted).toBeDefined();

        const auditLog = await t.prisma.auditLog.findFirst({
          where: { action: 'webhook_secret.rotated', entityId: createdEndpointId },
        });
        expect(auditLog).toBeDefined();
      });

      it('lists delivery attempts for the webhook endpoint', async () => {
        // Seed an attempt in DB
        await t.prisma.webhookAttempt.create({
          data: {
            endpointId: createdEndpointId,
            eventId: 'evt_test_123',
            attemptNumber: 1,
            status: 'SUCCEEDED',
            responseStatus: 200,
            durationMs: 120,
          },
        });

        const res = await request(t.http)
          .get(`/api/v1/merchants/me/webhooks/${createdEndpointId}/attempts`)
          .set('Cookie', merchantCookie)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body[0].status).toBe('SUCCEEDED');
      });

      it('deletes the webhook endpoint', async () => {
        await request(t.http)
          .delete(`/api/v1/merchants/me/webhooks/${createdEndpointId}`)
          .set('Cookie', merchantCookie)
          .expect(204);

        const dbEp = await t.prisma.webhookEndpoint.findUnique({
          where: { id: createdEndpointId },
        });
        expect(dbEp).toBeNull();
      });
    });
  });
});
