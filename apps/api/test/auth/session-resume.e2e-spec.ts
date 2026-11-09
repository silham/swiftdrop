import { AUTH_COOKIES } from '@swiftdrop/contracts';
import request from 'supertest';
import { safeNextPath } from '../../src/modules/auth/auth.controller';
import { createTestApp, type TestContext } from '../utils/app';

/**
 * GET /api/v1/auth/resume — the page-load half of silent refresh (M2). The web proxy sends the
 * browser here when the access cookie has expired; we rotate and redirect back.
 */
describe('session resume (integration)', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  async function refreshCookie(): Promise<string> {
    const res = await request(t.http)
      .post('/api/v1/auth/login')
      .send({ email: 'customer@swiftdrop.test', password: 'Password123!' })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    return cookies.find((c) => c.startsWith(`${AUTH_COOKIES.REFRESH}=`))!.split(';')[0];
  }

  it('rotates the session and redirects to `next` with fresh cookies', async () => {
    const cookie = await refreshCookie();
    const res = await request(t.http)
      .get('/api/v1/auth/resume?next=%2Fcustomer%2Fparcels%2Fabc%3Ftab%3D1')
      .set('Cookie', cookie)
      .expect(302);
    expect(res.headers.location).toBe('/customer/parcels/abc?tab=1');
    const set = res.headers['set-cookie'] as unknown as string[];
    expect(set.some((c) => c.startsWith(`${AUTH_COOKIES.ACCESS}=`))).toBe(true);
    const rotated = set.find((c) => c.startsWith(`${AUTH_COOKIES.REFRESH}=`))!;
    expect(rotated.split(';')[0]).not.toBe(cookie);

    // The new access cookie works.
    const access = set.find((c) => c.startsWith(`${AUTH_COOKIES.ACCESS}=`))!.split(';')[0];
    await request(t.http).get('/api/v1/users/me').set('Cookie', access).expect(200);
  });

  it('falls back to the role home when `next` is missing or off-site', async () => {
    for (const next of ['', '//evil.example', 'https://evil.example', '/\\evil.example']) {
      const cookie = await refreshCookie();
      const res = await request(t.http)
        .get(`/api/v1/auth/resume?next=${encodeURIComponent(next)}`)
        .set('Cookie', cookie)
        .expect(302);
      expect(res.headers.location).toBe('/customer');
    }
  });

  it('sends a visitor without a refresh cookie to /login, keeping `next`', async () => {
    const res = await request(t.http).get('/api/v1/auth/resume?next=%2Fadmin').expect(302);
    expect(res.headers.location).toBe('/login?next=%2Fadmin');
  });

  it('clears cookies and goes to /login for an invalid refresh token', async () => {
    const res = await request(t.http)
      .get('/api/v1/auth/resume?next=https%3A%2F%2Fevil.example')
      .set('Cookie', `${AUTH_COOKIES.REFRESH}=not-a-real-token`)
      .expect(302);
    expect(res.headers.location).toBe('/login');
    const set = res.headers['set-cookie'] as unknown as string[];
    expect(set.some((c) => c.startsWith(`${AUTH_COOKIES.REFRESH}=;`))).toBe(true);
  });
});

describe('safeNextPath', () => {
  it.each([
    ['/customer', '/customer'],
    ['/track/SD100000001?x=1', '/track/SD100000001?x=1'],
    ['//evil.example', null],
    ['/\\evil.example', null],
    ['https://evil.example', null],
    ['javascript:alert(1)', null],
    ['/api/v1/auth/resume', null],
    ['/ok\n/evil', null],
    [undefined, null],
    [['/a'], null],
  ])('%j → %j', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
