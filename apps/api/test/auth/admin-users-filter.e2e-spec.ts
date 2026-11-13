import request from 'supertest';
import { createTestApp, type TestContext } from '../utils/app';

/** GET /admin/users?isActive=… — the status filter for the admin users screen (M2). */
describe('admin users: status filter (integration)', () => {
  let t: TestContext;
  let disabledEmail: string;

  beforeAll(async () => {
    t = await createTestApp();
    disabledEmail = `disabled-filter-${Date.now()}@swiftdrop.test`;
    await t.prisma.user.create({
      data: { email: disabledEmail, name: 'Filter Disabled', role: 'CUSTOMER', isActive: false },
    });
  });

  afterAll(() => t.close());

  /** GET as ADMIN. The cookie is looked up first so no request is half-built while awaiting. */
  const list = async (query: string, status = 200) => {
    const cookie = await t.cookieFor('ADMIN');
    return request(t.http)
      .get(`/api/v1/admin/users?pageSize=100&${query}`)
      .set('Cookie', cookie)
      .expect(status);
  };

  it('isActive=false lists only disabled accounts', async () => {
    const res = await list('isActive=false');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((u: { isActive: boolean }) => u.isActive === false)).toBe(true);
    expect(res.body.data.some((u: { email: string }) => u.email === disabledEmail)).toBe(true);
  });

  it('isActive=true lists only active accounts', async () => {
    const res = await list('isActive=true');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((u: { isActive: boolean }) => u.isActive === true)).toBe(true);
    expect(res.body.data.some((u: { email: string }) => u.email === disabledEmail)).toBe(false);
  });

  it('combines with the role filter and search', async () => {
    const res = await list('isActive=false&role=CUSTOMER&search=Filter%20Disabled');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe(disabledEmail);
    const none = await list('isActive=false&role=COURIER');
    expect(none.body.data.some((u: { email: string }) => u.email === disabledEmail)).toBe(false);
  });

  it('without the filter both kinds are returned', async () => {
    const res = await list('');
    expect(res.body.data.some((u: { email: string }) => u.email === disabledEmail)).toBe(true);
    expect(res.body.data.some((u: { isActive: boolean }) => u.isActive)).toBe(true);
  });

  it('rejects a value that is not true/false (400) and non-admins (403)', async () => {
    await list('isActive=maybe', 400);
    const dispatcher = await t.cookieFor('DISPATCHER');
    await request(t.http)
      .get('/api/v1/admin/users?isActive=true')
      .set('Cookie', dispatcher)
      .expect(403);
    await request(t.http).get('/api/v1/admin/users?isActive=true').expect(401);
  });
});
