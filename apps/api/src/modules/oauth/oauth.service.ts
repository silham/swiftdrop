import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@swiftdrop/db';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthUser } from '../../common/auth';
import { AppError } from '../../common/errors/app-error';
import { InjectConfig, type Env } from '../../config/config.module';
import { PrismaService } from '../../infra/prisma';
import { OAuthError } from './oauth-error';

export const MCP_SCOPE = 'mcp';
export const CODE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_TTL_SECONDS = 60 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const;
type AuthMethod = (typeof AUTH_METHODS)[number];
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const token = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;
const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Query/body of an authorization request (the consent page passes them through unchanged). */
export interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
}

export interface ValidAuthorizeRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource: string;
}

/** Client credentials as sent to the token endpoint (body and/or HTTP Basic). */
export interface ClientCredentials {
  clientId?: string;
  clientSecret?: string;
  /** true when they came from an `Authorization: Basic` header */
  basic: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/**
 * OAuth 2.1 authorization server for MCP clients (Claude, ChatGPT…). Owner: M1. See ADR-0009.
 *
 * - Dynamic client registration (RFC 7591); public clients must use PKCE (S256 only).
 * - Authorization codes: 5 minutes, single use, bound to client, redirect URI and resource.
 * - Opaque access (1 h) and refresh (30 d) tokens, stored only as SHA-256 hashes. Refreshing
 *   rotates the pair; presenting a revoked refresh token revokes every grant of that client+user.
 * - Tokens are only valid for this server's MCP resource (RFC 8707 audience binding).
 */
@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectConfig() private readonly config: Env,
  ) {}

  get issuer(): string {
    return this.config.APP_URL.replace(/\/+$/, '');
  }

  get mcpResource(): string {
    return `${this.issuer}/mcp`;
  }

  /** RFC 8414 authorization server metadata. */
  metadata() {
    const base = this.issuer;
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/api/v1/oauth/token`,
      registration_endpoint: `${base}/api/v1/oauth/register`,
      revocation_endpoint: `${base}/api/v1/oauth/revoke`,
      scopes_supported: [MCP_SCOPE],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [...AUTH_METHODS],
      revocation_endpoint_auth_methods_supported: [...AUTH_METHODS],
      service_documentation: `${base}/api/docs`,
    };
  }

  /** RFC 9728 protected resource metadata for /mcp. */
  resourceMetadata() {
    return {
      resource: this.mcpResource,
      authorization_servers: [this.issuer],
      scopes_supported: [MCP_SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'SwiftDrop',
      resource_documentation: `${this.issuer}/api/docs`,
    };
  }

  // ---------------------------------------------------------------- registration (RFC 7591)

  async register(body: Record<string, unknown>) {
    const redirectUris = body.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10) {
      throw new OAuthError('invalid_redirect_uri', 'redirect_uris must list 1 to 10 URIs');
    }
    for (const uri of redirectUris) {
      if (!isAllowedRedirectUri(uri)) {
        throw new OAuthError(
          'invalid_redirect_uri',
          'Redirect URIs must be https (or http on localhost) without a fragment',
        );
      }
    }
    const method = (body.token_endpoint_auth_method ?? 'none') as AuthMethod;
    if (!AUTH_METHODS.includes(method)) {
      throw new OAuthError('invalid_client_metadata', 'Unsupported token_endpoint_auth_method');
    }
    if (!isSubset(body.grant_types, ['authorization_code', 'refresh_token'])) {
      throw new OAuthError('invalid_client_metadata', 'Unsupported grant_types');
    }
    if (!isSubset(body.response_types, ['code'])) {
      throw new OAuthError('invalid_client_metadata', 'Unsupported response_types');
    }
    const rawName = typeof body.client_name === 'string' ? body.client_name.trim() : '';
    const clientName = (rawName || 'MCP client').slice(0, 100);

    const clientId = token('mcp_client');
    const clientSecret = method === 'none' ? undefined : token('mcp_secret');
    const client = await this.prisma.mcpClient.create({
      data: {
        clientId,
        clientName,
        redirectUris: redirectUris as string[],
        tokenEndpointAuthMethod: method,
        secretHash: clientSecret ? sha256(clientSecret) : null,
      },
    });
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: method,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    };
  }

  // ---------------------------------------------------------------- authorization

  /**
   * Checks an authorization request before the consent screen and again when the user answers.
   * Problems are shown to the user (400) and never redirected: an unknown client or an
   * unregistered redirect URI must not become an open redirect.
   */
  async validateAuthorize(p: AuthorizeParams): Promise<ValidAuthorizeRequest> {
    const bad = (message: string) =>
      new AppError('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST);
    if (!p.client_id) throw bad('client_id is missing');
    const client = await this.prisma.mcpClient.findUnique({ where: { clientId: p.client_id } });
    if (!client) throw bad('This app is not registered with SwiftDrop');

    const redirectUri =
      p.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
      throw bad('The redirect address does not match the one this app registered');
    }
    if (p.response_type !== 'code') throw bad('Only response_type=code is supported');
    if (!p.code_challenge || p.code_challenge_method !== 'S256') {
      throw bad('PKCE with code_challenge_method=S256 is required');
    }
    if (!/^[A-Za-z0-9\-_]{43}$/.test(p.code_challenge)) throw bad('code_challenge is malformed');
    if (p.resource && normalise(p.resource) !== this.mcpResource) {
      throw bad('This server only issues tokens for its MCP endpoint');
    }
    if (p.state && p.state.length > 500) throw bad('state is too long');

    return {
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUri,
      codeChallenge: p.code_challenge,
      state: p.state,
      resource: this.mcpResource,
    };
  }

  /** The user answered the consent screen: build the redirect back to the client. */
  async decide(
    user: AuthUser,
    p: AuthorizeParams,
    decision: 'allow' | 'deny',
  ): Promise<{ redirectTo: string }> {
    const req = await this.validateAuthorize(p);
    const url = new URL(req.redirectUri);
    if (decision === 'deny') {
      url.searchParams.set('error', 'access_denied');
      url.searchParams.set('error_description', 'The user declined access');
    } else {
      const code = token('mcp_code');
      await this.prisma.mcpAuthorizationCode.create({
        data: {
          codeHash: sha256(code),
          clientId: req.clientId,
          userId: user.id,
          redirectUri: req.redirectUri,
          codeChallenge: req.codeChallenge,
          scope: MCP_SCOPE,
          resource: req.resource,
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      });
      url.searchParams.set('code', code);
    }
    if (req.state) url.searchParams.set('state', req.state);
    url.searchParams.set('iss', this.issuer); // RFC 9207 mix-up protection
    return { redirectTo: url.toString() };
  }

  // ---------------------------------------------------------------- token endpoint

  async token(body: Record<string, unknown>, creds: ClientCredentials): Promise<TokenResponse> {
    const grantType = str(body.grant_type);
    if (grantType === 'authorization_code') return this.exchangeCode(body, creds);
    if (grantType === 'refresh_token') return this.refresh(body, creds);
    throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token');
  }

  private async exchangeCode(
    body: Record<string, unknown>,
    creds: ClientCredentials,
  ): Promise<TokenResponse> {
    const client = await this.authenticateClient(creds);
    const code = str(body.code);
    const verifier = str(body.code_verifier);
    if (!code || !verifier)
      throw new OAuthError('invalid_request', 'code and code_verifier are required');
    if (!VERIFIER.test(verifier)) throw new OAuthError('invalid_grant', 'Malformed code_verifier');

    const row = await this.prisma.mcpAuthorizationCode.findUnique({
      where: { codeHash: sha256(code) },
      include: { user: { select: { isActive: true } } },
    });
    const invalid = () =>
      new OAuthError('invalid_grant', 'The authorization code is invalid or expired');
    if (!row || row.usedAt || row.expiresAt < new Date() || row.clientId !== client.clientId) {
      throw invalid();
    }
    const redirectUri = str(body.redirect_uri);
    if (redirectUri && redirectUri !== row.redirectUri) throw invalid();
    const resource = str(body.resource);
    if (resource && normalise(resource) !== row.resource) {
      throw new OAuthError('invalid_target', 'Unknown resource');
    }
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (!sameHash(challenge, row.codeChallenge)) throw invalid();
    if (!row.user.isActive) throw invalid();

    return this.prisma.$transaction(async (tx) => {
      // Single use, even under a race: only one request can flip usedAt.
      const used = await tx.mcpAuthorizationCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw invalid();
      return this.issue(tx, row.clientId, row.userId, row.resource);
    });
  }

  private async refresh(
    body: Record<string, unknown>,
    creds: ClientCredentials,
  ): Promise<TokenResponse> {
    const client = await this.authenticateClient(creds);
    const refreshToken = str(body.refresh_token);
    if (!refreshToken) throw new OAuthError('invalid_request', 'refresh_token is required');
    const grant = await this.prisma.mcpGrant.findUnique({
      where: { refreshHash: sha256(refreshToken) },
      include: { user: { select: { isActive: true } } },
    });
    const invalid = () =>
      new OAuthError('invalid_grant', 'The refresh token is invalid or expired');
    if (!grant || grant.clientId !== client.clientId) throw invalid();
    if (grant.revokedAt) {
      // A rotated-out token came back: assume it leaked and end this client's access for the user.
      await this.prisma.mcpGrant.updateMany({
        where: { clientId: grant.clientId, userId: grant.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw invalid();
    }
    if (grant.refreshExpiresAt < new Date() || !grant.user.isActive) throw invalid();

    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.mcpGrant.updateMany({
        where: { id: grant.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw invalid();
      return this.issue(tx, grant.clientId, grant.userId, grant.resource);
    });
  }

  private async issue(
    tx: Prisma.TransactionClient,
    clientId: string,
    userId: string,
    resource: string,
  ): Promise<TokenResponse> {
    const accessToken = token('mcp_at');
    const refreshToken = token('mcp_rt');
    const now = Date.now();
    await tx.mcpGrant.create({
      data: {
        accessHash: sha256(accessToken),
        refreshHash: sha256(refreshToken),
        clientId,
        userId,
        scope: MCP_SCOPE,
        resource,
        accessExpiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000),
        refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
      },
    });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: MCP_SCOPE,
    };
  }

  /** RFC 7009: always succeeds for an authenticated client, whether or not the token existed. */
  async revoke(body: Record<string, unknown>, creds: ClientCredentials): Promise<void> {
    const client = await this.authenticateClient(creds);
    const value = str(body.token);
    if (!value) throw new OAuthError('invalid_request', 'token is required');
    const hash = sha256(value);
    await this.prisma.mcpGrant.updateMany({
      where: {
        clientId: client.clientId,
        revokedAt: null,
        OR: [{ accessHash: hash }, { refreshHash: hash }],
      },
      data: { revokedAt: new Date() },
    });
  }

  private async authenticateClient(creds: ClientCredentials) {
    const unauthorized = () =>
      new OAuthError('invalid_client', 'Client authentication failed', 401);
    if (!creds.clientId) throw unauthorized();
    const client = await this.prisma.mcpClient.findUnique({ where: { clientId: creds.clientId } });
    if (!client) throw unauthorized();
    const method = client.tokenEndpointAuthMethod as AuthMethod;
    if (method === 'none') {
      if (creds.clientSecret) throw unauthorized();
      return client;
    }
    if ((method === 'client_secret_basic') !== creds.basic) throw unauthorized();
    if (!creds.clientSecret || !client.secretHash) throw unauthorized();
    if (!sameHash(sha256(creds.clientSecret), client.secretHash)) throw unauthorized();
    return client;
  }

  // ---------------------------------------------------------------- resource server side

  /**
   * Resolves a bearer token presented at /mcp. Returns null for anything unusable (unknown,
   * expired, revoked, another resource, disabled user). The role comes from the database, so a role
   * change applies to existing tokens straight away.
   */
  async authenticateBearer(accessToken: string): Promise<AuthUser | null> {
    if (!accessToken) return null;
    const grant = await this.prisma.mcpGrant.findUnique({
      where: { accessHash: sha256(accessToken) },
      include: { user: { select: { id: true, email: true, role: true, isActive: true } } },
    });
    if (!grant || grant.revokedAt || grant.accessExpiresAt < new Date()) return null;
    if (grant.resource !== this.mcpResource || !grant.user.isActive) return null;
    return { id: grant.user.id, email: grant.user.email, role: grant.user.role };
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 && v.length <= 2048 ? v : undefined;
}

function normalise(url: string): string {
  return url.replace(/\/+$/, '');
}

function isSubset(value: unknown, allowed: string[]): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) && value.every((v) => typeof v === 'string' && allowed.includes(v));
}

/** https anywhere; plain http only for loopback (native/desktop clients). No fragments. */
export function isAllowedRedirectUri(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
