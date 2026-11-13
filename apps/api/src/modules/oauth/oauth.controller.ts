import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public, type AuthUser } from '../../common/auth';
import { AiToolsService } from '../ai-tools';
import {
  AuthorizeCheckDto,
  AuthorizeDecisionDto,
  AuthorizeQueryDto,
  AuthorizeRedirectDto,
} from './dto/oauth.dto';
import { OAuthError } from './oauth-error';
import { OAuthService, type ClientCredentials } from './oauth.service';

/**
 * OAuth 2.1 authorization server endpoints for MCP clients. Owner: M1. See ADR-0009.
 * The consent screen itself is the web page /oauth/authorize; it calls `authorize/check` and
 * `authorize` with the user's normal session cookie.
 */
@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly aiTools: AiToolsService,
  ) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Dynamic client registration (RFC 7591)' })
  async register(@Body() body: Record<string, unknown>, @Res() res: Response) {
    await respond(res, 201, () => this.oauth.register(body ?? {}));
  }

  @Get('authorize/check')
  @ApiOperation({ summary: 'Validate an authorization request for the consent screen' })
  @ApiOkResponse({ type: AuthorizeCheckDto })
  async check(
    @CurrentUser() user: AuthUser,
    @Query() q: AuthorizeQueryDto,
  ): Promise<AuthorizeCheckDto> {
    const req = await this.oauth.validateAuthorize(q);
    return {
      clientName: req.clientName,
      redirectHost: new URL(req.redirectUri).host,
      user: { email: user.email, role: user.role },
      tools: this.aiTools
        .toolsFor(user)
        .map((t) => ({ name: t.name, title: t.title, readOnly: t.readOnly })),
    };
  }

  @Post('authorize')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Record the user’s consent decision; returns where to send the browser',
  })
  @ApiOkResponse({ type: AuthorizeRedirectDto })
  decide(
    @CurrentUser() user: AuthUser,
    @Body() dto: AuthorizeDecisionDto,
  ): Promise<AuthorizeRedirectDto> {
    const { decision, ...params } = dto;
    return this.oauth.decide(user, params, decision);
  }

  @Post('token')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Token endpoint (authorization_code with PKCE, refresh_token)' })
  async token(@Body() body: Record<string, unknown>, @Req() req: Request, @Res() res: Response) {
    const form = body ?? {};
    await respond(res, 200, () => this.oauth.token(form, credentials(req, form)));
  }

  @Post('revoke')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Token revocation (RFC 7009)' })
  async revoke(@Body() body: Record<string, unknown>, @Req() req: Request, @Res() res: Response) {
    const form = body ?? {};
    await respond(res, 200, async () => {
      await this.oauth.revoke(form, credentials(req, form));
      return {};
    });
  }
}

/** Discovery documents at fixed root paths (excluded from the /api/v1 prefix, see ROOT_ROUTES). */
@ApiExcludeController()
@Controller('.well-known')
@Public()
export class WellKnownController {
  constructor(private readonly oauth: OAuthService) {}

  @Get('oauth-authorization-server')
  authorizationServer() {
    return this.oauth.metadata();
  }

  /** Some clients only look for the OpenID Connect discovery document. */
  @Get('openid-configuration')
  openidConfiguration() {
    return this.oauth.metadata();
  }

  @Get('oauth-protected-resource')
  protectedResource() {
    return this.oauth.resourceMetadata();
  }

  @Get('oauth-protected-resource/mcp')
  protectedResourceMcp() {
    return this.oauth.resourceMetadata();
  }
}

/** Run an OAuth endpoint and answer in the OAuth error format; tokens must never be cached. */
async function respond(res: Response, status: number, run: () => Promise<unknown>) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  try {
    res.status(status).json(await run());
  } catch (err) {
    if (!(err instanceof OAuthError)) throw err;
    if (err.status === 401) res.setHeader('WWW-Authenticate', 'Basic realm="swiftdrop"');
    res.status(err.status).json(err.toJSON());
  }
}

/** Client credentials from `Authorization: Basic` (RFC 6749 §2.3.1, form-encoded parts) or the body. */
function credentials(req: Request, body: Record<string, unknown>): ClientCredentials {
  const header = req.headers.authorization;
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i > 0) {
      const decode = (s: string) => {
        try {
          return decodeURIComponent(s.replace(/\+/g, ' '));
        } catch {
          return s;
        }
      };
      return {
        clientId: decode(decoded.slice(0, i)),
        clientSecret: decode(decoded.slice(i + 1)),
        basic: true,
      };
    }
  }
  const pick = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return { clientId: pick(body.client_id), clientSecret: pick(body.client_secret), basic: false };
}
