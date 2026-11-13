import type { Role } from '@swiftdrop/contracts';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { createTestApp, type TestContext } from '../utils/app';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const RESOURCE = 'http://localhost:8080/mcp';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * OAuth 2.1 authorization server + MCP endpoint (ADR-0009), end to end through HTTP:
 * discovery → dynamic registration → consent → code + PKCE → tokens → MCP tools, plus the ways a
 * token must be refused.
 */
describe('MCP over OAuth (integration)', () => {
  let t: TestContext;
  /** One public client for most tests: registration is limited to 10 per minute per IP. */
  let shared: { client_id: string };

  beforeAll(async () => {
    t = await createTestApp();
    shared = await registerClient();
  });
  afterAll(() => t.close());

  async function registerClient(extra: Record<string, unknown> = {}) {
    const res = await request(t.http)
      .post('/api/v1/oauth/register')
      .send({ client_name: 'Test AI', redirect_uris: [REDIRECT], ...extra })
      .expect(201);
    return res.body as { client_id: string; client_secret?: string };
  }

  /** Consent as `role` (cookie session) and return the code that comes back on the redirect. */
  async function authorize(clientId: string, challenge: string, role: Role, email?: string) {
    const cookie = await t.cookieFor(role, email);
    const res = await request(t.http)
      .post('/api/v1/oauth/authorize')
      .set('Cookie', cookie)
      .send({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'xyz',
        resource: RESOURCE,
        decision: 'allow',
      })
      .expect(200);
    const url = new URL(res.body.redirectTo);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get('state')).toBe('xyz');
    return url.searchParams.get('code')!;
  }

  const exchange = (form: Record<string, string>) =>
    request(t.http).post('/api/v1/oauth/token').type('form').send(form);

  /** Full flow for a role; returns the token response. */
  async function connect(role: Role, email?: string) {
    const client = shared;
    const { verifier, challenge } = pkce();
    const code = await authorize(client.client_id, challenge, role, email);
    const res = await exchange({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      resource: RESOURCE,
    }).expect(200);
    return { ...res.body, clientId: client.client_id } as {
      access_token: string;
      refresh_token: string;
      clientId: string;
    };
  }

  let rpcId = 0;
  const mcp = (token: string | null, method: string, params: Record<string, unknown> = {}) => {
    const req = request(t.http)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send({ jsonrpc: '2.0', id: ++rpcId, method, params });
  };
  const toolNames = async (token: string) =>
    ((await mcp(token, 'tools/list').expect(200)).body.result.tools as { name: string }[])
      .map((x) => x.name)
      .sort();
  const callTool = async (token: string, name: string, args: Record<string, unknown>) =>
    (await mcp(token, 'tools/call', { name, arguments: args }).expect(200)).body.result as {
      content: { text: string }[];
      isError?: boolean;
    };

  describe('discovery', () => {
    it('publishes authorization server and protected resource metadata', async () => {
      const as = await request(t.http).get('/.well-known/oauth-authorization-server').expect(200);
      expect(as.body).toMatchObject({
        issuer: 'http://localhost:8080',
        authorization_endpoint: 'http://localhost:8080/oauth/authorize',
        token_endpoint: 'http://localhost:8080/api/v1/oauth/token',
        registration_endpoint: 'http://localhost:8080/api/v1/oauth/register',
        code_challenge_methods_supported: ['S256'],
      });
      const rs = await request(t.http).get('/.well-known/oauth-protected-resource/mcp').expect(200);
      expect(rs.body).toMatchObject({
        resource: RESOURCE,
        authorization_servers: ['http://localhost:8080'],
      });
    });

    it('answers /mcp without a token with 401 and where to find the authorization server', async () => {
      const res = await mcp(null, 'tools/list').expect(401);
      expect(res.headers['www-authenticate']).toBe(
        'Bearer resource_metadata="http://localhost:8080/.well-known/oauth-protected-resource/mcp"',
      );
    });

    it('rejects GET and DELETE on the stateless endpoint', async () => {
      await request(t.http).get('/mcp').expect(405);
      await request(t.http).delete('/mcp').expect(405);
    });
  });

  describe('dynamic client registration', () => {
    it.each([
      [{ redirect_uris: [] }, 'invalid_redirect_uri'],
      [{ redirect_uris: ['http://evil.example/cb'] }, 'invalid_redirect_uri'],
      [{ redirect_uris: ['https://ok.example/cb#frag'] }, 'invalid_redirect_uri'],
      [
        { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'private_key_jwt' },
        'invalid_client_metadata',
      ],
      [{ redirect_uris: [REDIRECT], grant_types: ['password'] }, 'invalid_client_metadata'],
    ])('rejects bad metadata %j', async (body, error) => {
      const res = await request(t.http).post('/api/v1/oauth/register').send(body).expect(400);
      expect(res.body.error).toBe(error);
    });

    it('allows http only for loopback redirect URIs', async () => {
      await request(t.http)
        .post('/api/v1/oauth/register')
        .send({ redirect_uris: ['http://127.0.0.1:6274/oauth/callback'] })
        .expect(201);
    });
  });

  describe('consent', () => {
    it('shows the consent screen data for the signed-in user only', async () => {
      const client = shared;
      const { challenge } = pkce();
      const query = {
        response_type: 'code',
        client_id: client.client_id,
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      };
      await request(t.http).get('/api/v1/oauth/authorize/check').query(query).expect(401);
      const res = await request(t.http)
        .get('/api/v1/oauth/authorize/check')
        .query(query)
        .set('Cookie', await t.cookieFor('COURIER'))
        .expect(200);
      expect(res.body).toMatchObject({ clientName: 'Test AI', redirectHost: 'claude.ai' });
      expect(res.body.user.role).toBe('COURIER');
      expect(res.body.tools.map((x: { name: string }) => x.name)).toContain('list_my_deliveries');
    });

    it('never redirects to an unregistered redirect URI or for an unknown client', async () => {
      const client = shared;
      const { challenge } = pkce();
      const base = {
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        decision: 'allow',
      };
      const cookie = await t.cookieFor('CUSTOMER');
      await request(t.http)
        .post('/api/v1/oauth/authorize')
        .set('Cookie', cookie)
        .send({ ...base, client_id: client.client_id, redirect_uri: 'https://evil.example/cb' })
        .expect(400);
      await request(t.http)
        .post('/api/v1/oauth/authorize')
        .set('Cookie', cookie)
        .send({ ...base, client_id: 'nope', redirect_uri: REDIRECT })
        .expect(400);
      await request(t.http)
        .post('/api/v1/oauth/authorize')
        .set('Cookie', cookie)
        .send({ ...base, client_id: client.client_id, code_challenge_method: 'plain' })
        .expect(400);
    });

    it('sends access_denied back when the user declines', async () => {
      const client = shared;
      const res = await request(t.http)
        .post('/api/v1/oauth/authorize')
        .set('Cookie', await t.cookieFor('CUSTOMER'))
        .send({
          response_type: 'code',
          client_id: client.client_id,
          code_challenge: pkce().challenge,
          code_challenge_method: 'S256',
          state: 's1',
          decision: 'deny',
        })
        .expect(200);
      const url = new URL(res.body.redirectTo);
      expect(url.searchParams.get('error')).toBe('access_denied');
      expect(url.searchParams.get('state')).toBe('s1');
      expect(url.searchParams.get('code')).toBeNull();
    });
  });

  describe('token endpoint', () => {
    it('refuses a wrong PKCE verifier, a reused code and a different redirect URI', async () => {
      const client = shared;
      const { verifier, challenge } = pkce();
      const code = await authorize(client.client_id, challenge, 'CUSTOMER');
      const base = { grant_type: 'authorization_code', code, client_id: client.client_id };

      let res = await exchange({ ...base, code_verifier: pkce().verifier }).expect(400);
      expect(res.body.error).toBe('invalid_grant');
      res = await exchange({
        ...base,
        code_verifier: verifier,
        redirect_uri: 'https://other.example/cb',
      }).expect(400);
      expect(res.body.error).toBe('invalid_grant');

      res = await exchange({ ...base, code_verifier: verifier }).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'mcp' });

      res = await exchange({ ...base, code_verifier: verifier }).expect(400);
      expect(res.body.error).toBe('invalid_grant');
    });

    it('refuses a code issued to another client', async () => {
      const a = shared;
      const b = await registerClient();
      const { verifier, challenge } = pkce();
      const code = await authorize(a.client_id, challenge, 'CUSTOMER');
      const res = await exchange({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: b.client_id,
      }).expect(400);
      expect(res.body.error).toBe('invalid_grant');
    });

    it('authenticates confidential clients with their secret', async () => {
      const client = await registerClient({ token_endpoint_auth_method: 'client_secret_basic' });
      expect(client.client_secret).toBeDefined();
      const { verifier, challenge } = pkce();
      const code = await authorize(client.client_id, challenge, 'CUSTOMER');
      const form = { grant_type: 'authorization_code', code, code_verifier: verifier };

      await exchange({ ...form, client_id: client.client_id }).expect(401);
      await request(t.http)
        .post('/api/v1/oauth/token')
        .auth(client.client_id, 'wrong-secret')
        .type('form')
        .send(form)
        .expect(401);
      await request(t.http)
        .post('/api/v1/oauth/token')
        .auth(client.client_id, client.client_secret!)
        .type('form')
        .send(form)
        .expect(200);
    });

    it('rotates refresh tokens and revokes the grant when an old one is replayed', async () => {
      const first = await connect('CUSTOMER');
      const refreshed = await exchange({
        grant_type: 'refresh_token',
        refresh_token: first.refresh_token,
        client_id: first.clientId,
      }).expect(200);
      expect(refreshed.body.refresh_token).not.toBe(first.refresh_token);

      // The old access token is gone, the new one works.
      await mcp(first.access_token, 'tools/list').expect(401);
      await mcp(refreshed.body.access_token, 'tools/list').expect(200);

      // Replaying the rotated-out refresh token kills the whole chain.
      const replay = await exchange({
        grant_type: 'refresh_token',
        refresh_token: first.refresh_token,
        client_id: first.clientId,
      }).expect(400);
      expect(replay.body.error).toBe('invalid_grant');
      await mcp(refreshed.body.access_token, 'tools/list').expect(401);
    });

    it('revokes a token (RFC 7009)', async () => {
      const grant = await connect('CUSTOMER');
      await request(t.http)
        .post('/api/v1/oauth/revoke')
        .type('form')
        .send({ token: grant.access_token, client_id: grant.clientId })
        .expect(200);
      const res = await mcp(grant.access_token, 'tools/list').expect(401);
      expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
    });
  });

  describe('MCP tools', () => {
    it('initializes and lists only the tools for the signed-in role', async () => {
      const customer = await connect('CUSTOMER');
      const init = await mcp(customer.access_token, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'jest', version: '1' },
      }).expect(200);
      expect(init.body.result.serverInfo.name).toBe('swiftdrop');

      const customerTools = await toolNames(customer.access_token);
      expect(customerTools).toEqual(
        expect.arrayContaining([
          'track_parcel',
          'estimate_fee',
          'list_my_parcels',
          'book_delivery',
        ]),
      );
      expect(customerTools).not.toContain('assign_parcel');
      expect(customerTools).not.toContain('update_delivery_status');

      const courierTools = await toolNames((await connect('COURIER')).access_token);
      expect(courierTools).toContain('update_delivery_status');
      expect(courierTools).not.toContain('list_my_parcels');

      const dispatcherTools = await toolNames((await connect('DISPATCHER')).access_token);
      expect(dispatcherTools).toEqual(
        expect.arrayContaining(['assign_parcel', 'courier_workload']),
      );
    });

    it('runs public and role tools against the real services', async () => {
      const { access_token } = await connect('CUSTOMER', 'customer@swiftdrop.test');
      const tracked = await callTool(access_token, 'track_parcel', {
        trackingNumber: 'sd100000002',
      });
      expect(tracked.isError).toBeFalsy();
      expect(JSON.parse(tracked.content[0].text)).toMatchObject({
        trackingNumber: 'SD100000002',
        status: 'IN_TRANSIT',
      });

      const quote = await callTool(access_token, 'estimate_fee', {
        pickupCity: 'colombo',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 1.5,
      });
      expect(JSON.parse(quote.content[0].text)).toMatchObject({
        feeCents: 55000,
        fee: 'LKR 550.00',
      });

      const mine = await callTool(access_token, 'list_my_parcels', {});
      expect(mine.isError).toBeFalsy();
      expect(JSON.parse(mine.content[0].text).data.length).toBeGreaterThan(0);
    });

    it("a courier cannot touch another courier's delivery", async () => {
      // SD100000002 is assigned to courier1 in the seed; courier2 asks to change it.
      const { access_token } = await connect('COURIER', 'courier2@swiftdrop.test');
      const res = await callTool(access_token, 'update_delivery_status', {
        trackingNumber: 'SD100000002',
        status: 'OUT_FOR_DELIVERY',
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(/not found/i);
      const parcel = await t.prisma.parcel.findUniqueOrThrow({
        where: { trackingNumber: 'SD100000002' },
      });
      expect(parcel.status).toBe('IN_TRANSIT');
    });

    it("a customer cannot read someone else's parcel", async () => {
      const { access_token } = await connect('CUSTOMER', 'customer2@swiftdrop.test');
      const res = await callTool(access_token, 'get_my_parcel', { trackingNumber: 'SD100000002' });
      expect(res.isError).toBe(true);
    });

    it('validates tool input with the endpoint rules', async () => {
      const { access_token } = await connect('CUSTOMER');
      const res = await callTool(access_token, 'track_parcel', { trackingNumber: 'nope' });
      expect(res.isError).toBe(true);
    });

    it('stops working as soon as the user is disabled', async () => {
      const email = `mcp-disabled-${Date.now()}@swiftdrop.test`;
      const user = await t.prisma.user.create({
        data: { email, name: 'MCP Disabled', role: 'CUSTOMER' },
      });
      const { access_token } = await connect('CUSTOMER', email);
      await mcp(access_token, 'tools/list').expect(200);
      await t.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      await mcp(access_token, 'tools/list').expect(401);
    });

    it('refuses a token that has expired', async () => {
      const { access_token } = await connect('CUSTOMER');
      await t.prisma.mcpGrant.updateMany({
        where: { accessHash: createHash('sha256').update(access_token).digest('hex') },
        data: { accessExpiresAt: new Date(Date.now() - 1000) },
      });
      await mcp(access_token, 'tools/list').expect(401);
    });
  });
});
