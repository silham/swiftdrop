/**
 * Merchant tenancy and cross-module checks (M5), added at merge review:
 * - webhook secrets written by the API can be decrypted by M8's worker (otherwise no webhook is signed)
 * - one merchant can't touch another merchant's API keys or webhooks (404)
 * - suspended merchants' keys are refused; partner routes ignore session cookies
 * - other roles can't use the merchant portal API; the orders status filter is validated
 */
import { randomUUID } from 'node:crypto';
import { MERCHANT_API_KEY_HEADER } from '@swiftdrop/contracts';
import request from 'supertest';
import { createTestApp, type TestContext } from '../utils/app';

// The worker can't be imported statically from apps/api (rootDir), so load it at runtime,
// the same way test/events/worker.ts does.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { decryptSecret } = require('../../../worker/src/consumers/webhooks/secret-crypto') as {
  decryptSecret: (encrypted: string, base64Key: string) => string;
};

describe('merchant tenancy (integration)', () => {
  let t: TestContext;
  let cookieA: string;
  let cookieB: string;
  let keyIdA: string;
  let webhookIdA: string;
  let rawSecretA: string;

  /** A second approved merchant with its own owner account. */
  async function createMerchant(status: 'APPROVED' | 'SUSPENDED') {
    const email = `tenancy-${status.toLowerCase()}-${randomUUID().slice(0, 8)}@swiftdrop.test`;
    const user = await t.prisma.user.create({
      data: { email, name: `Tenancy ${status}`, role: 'MERCHANT' },
    });
    const merchant = await t.prisma.merchant.create({
      data: {
        ownerUserId: user.id,
        businessName: `Tenancy ${status}`,
        contactEmail: email,
        status,
      },
    });
    return { email, merchant };
  }

  beforeAll(async () => {
    t = await createTestApp();
    cookieA = await t.cookieFor('MERCHANT', 'merchant@swiftdrop.test');
    const b = await createMerchant('APPROVED');
    cookieB = await t.cookieFor('MERCHANT', b.email);

    const key = await request(t.http)
      .post('/api/v1/merchants/me/api-keys')
      .set('Cookie', cookieA)
      .send({ name: 'Tenancy key A' })
      .expect(201);
    keyIdA = key.body.id;

    const hook = await request(t.http)
      .post('/api/v1/merchants/me/webhooks')
      .set('Cookie', cookieA)
      .send({ url: 'https://hooks.example.com/swiftdrop', eventTypes: ['parcel.status_changed'] })
      .expect(201);
    webhookIdA = hook.body.id;
    rawSecretA = hook.body.secret;
  });

  afterAll(async () => {
    await t.close();
  });

  it("stores webhook secrets in the format M8's worker decrypts", async () => {
    const endpoint = await t.prisma.webhookEndpoint.findUniqueOrThrow({
      where: { id: webhookIdA },
    });
    const key = process.env.WEBHOOK_SECRET_ENC_KEY!;
    expect(decryptSecret(endpoint.secretEncrypted, key)).toBe(rawSecretA);

    const rotated = await request(t.http)
      .post(`/api/v1/merchants/me/webhooks/${webhookIdA}/rotate-secret`)
      .set('Cookie', cookieA)
      .expect((res) => expect([200, 201]).toContain(res.status));
    const after = await t.prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: webhookIdA } });
    expect(decryptSecret(after.secretEncrypted, key)).toBe(rotated.body.secret);
  });

  describe("another merchant gets 404 for merchant A's resources", () => {
    it('cannot revoke the API key', async () => {
      await request(t.http)
        .delete(`/api/v1/merchants/me/api-keys/${keyIdA}`)
        .set('Cookie', cookieB)
        .expect(404);
      const key = await t.prisma.apiKey.findUniqueOrThrow({ where: { id: keyIdA } });
      expect(key.revokedAt).toBeNull();
    });

    it('cannot update, rotate, read attempts of or delete the webhook', async () => {
      const base = `/api/v1/merchants/me/webhooks/${webhookIdA}`;
      await request(t.http)
        .patch(base)
        .set('Cookie', cookieB)
        .send({ isActive: false })
        .expect(404);
      await request(t.http).post(`${base}/rotate-secret`).set('Cookie', cookieB).expect(404);
      await request(t.http).get(`${base}/attempts`).set('Cookie', cookieB).expect(404);
      await request(t.http).delete(base).set('Cookie', cookieB).expect(404);

      const endpoint = await t.prisma.webhookEndpoint.findUnique({ where: { id: webhookIdA } });
      expect(endpoint?.isActive).toBe(true);
    });

    it('does not see them in its own lists', async () => {
      const keys = await request(t.http)
        .get('/api/v1/merchants/me/api-keys')
        .set('Cookie', cookieB)
        .expect(200);
      expect(JSON.stringify(keys.body)).not.toContain(keyIdA);
      const hooks = await request(t.http)
        .get('/api/v1/merchants/me/webhooks')
        .set('Cookie', cookieB)
        .expect(200);
      expect(JSON.stringify(hooks.body)).not.toContain(webhookIdA);
    });
  });

  describe('partner API authentication', () => {
    it("refuses a suspended merchant's key (403)", async () => {
      const { email } = await createMerchant('APPROVED');
      const cookie = await t.cookieFor('MERCHANT', email);
      const created = await request(t.http)
        .post('/api/v1/merchants/me/api-keys')
        .set('Cookie', cookie)
        .send({ name: 'Soon suspended' })
        .expect(201);
      const rawKey: string = created.body.key;

      await t.prisma.merchant.updateMany({
        where: { contactEmail: email },
        data: { status: 'SUSPENDED' },
      });

      await request(t.http)
        .get('/api/v1/merchant/parcels')
        .set(MERCHANT_API_KEY_HEADER, rawKey)
        .expect(403);
    });

    it('ignores a valid merchant session cookie (401 without X-Api-Key)', async () => {
      await request(t.http).get('/api/v1/merchant/parcels').set('Cookie', cookieA).expect(401);
    });
  });

  describe('merchant portal API', () => {
    it.each(['CUSTOMER', 'COURIER', 'DISPATCHER'] as const)(
      'refuses the %s role (403)',
      async (role) => {
        const cookie = await t.cookieFor(role);
        for (const path of ['me/api-keys', 'me/webhooks', 'me/parcels', 'me/stats']) {
          await request(t.http).get(`/api/v1/merchants/${path}`).set('Cookie', cookie).expect(403);
        }
      },
    );

    it('filters own orders by status and validates the filter', async () => {
      const res = await request(t.http)
        .get('/api/v1/merchants/me/parcels?status=CREATED')
        .set('Cookie', cookieA)
        .expect(200);
      for (const parcel of res.body.data) expect(parcel.status).toBe('CREATED');

      await request(t.http)
        .get('/api/v1/merchants/me/parcels?status=BOGUS')
        .set('Cookie', cookieA)
        .expect(400);
    });

    it("only returns the caller's own orders", async () => {
      const res = await request(t.http)
        .get('/api/v1/merchants/me/parcels?pageSize=100')
        .set('Cookie', cookieB)
        .expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });
  });
});
