import request from 'supertest';
import { createTestApp, type TestContext } from '../utils/app';

/**
 * Public merchant sign-up is limited to 10 requests a minute per client. Counts are kept per app
 * instance, so this file has its own app and can't be affected by (or affect) other suites.
 */
describe('merchant sign-up rate limit (integration)', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  it('answers 429 RATE_LIMITED after 10 sign-ups in a minute', async () => {
    const stamp = Date.now();
    const signUp = (n: number) =>
      request(t.http)
        .post('/api/v1/merchants/register')
        .send({
          businessName: `Rate Limit Shop ${n}`,
          contactName: 'Rate Limit',
          email: `rate-limit-${stamp}-${n}@swiftdrop.test`,
          password: 'Password123!',
        });

    for (let n = 1; n <= 10; n++) {
      await signUp(n).expect(201);
    }
    const blocked = await signUp(11).expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
