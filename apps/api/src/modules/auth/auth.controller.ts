import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AUTH_COOKIES } from '@swiftdrop/contracts';
import { AppError } from '../../common/errors/app-error';
import type { Request, Response } from 'express';
import { Public, TokenService } from '../../common/auth';
import { AuthService, type IssuedSession } from './auth.service';
import { AuthResponseDto, LoginDto, RegisterDto } from './dto/auth.dto';

/** Owner: M2. Auth endpoints are rate-limited more strictly than the global default. */
@ApiTags('auth')
@Controller('auth')
@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a CUSTOMER account and start a session' })
  @ApiOkResponse({ type: AuthResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.auth.register(dto, meta(req)));
  }

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.auth.login(dto, meta(req)));
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthResponseDto })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.startSession(
      res,
      await this.auth.refresh(req.cookies?.[AUTH_COOKIES.REFRESH], meta(req)),
    );
  }

  /**
   * Page-load session resume. The refresh cookie is scoped to /api/v1/auth, so the web proxy can't
   * see it; when the short-lived access cookie has expired the proxy sends the browser here. We
   * rotate the session and bounce back to `next`, or to /login when the refresh token is invalid.
   */
  @Get('resume')
  @ApiOperation({ summary: 'Refresh the session, then redirect to `next` (or /login)' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async resume(@Query('next') next: string | undefined, @Req() req: Request, @Res() res: Response) {
    const target = safeNextPath(next);
    let session: IssuedSession;
    try {
      session = await this.auth.refresh(req.cookies?.[AUTH_COOKIES.REFRESH], meta(req));
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      this.tokens.clearAuthCookies(res);
      return res.redirect(target ? `/login?next=${encodeURIComponent(target)}` : '/login');
    }
    this.startSession(res, session);
    return res.redirect(target ?? session.home);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[AUTH_COOKIES.REFRESH]);
    this.tokens.clearAuthCookies(res);
  }

  @Get('google')
  @ApiOperation({ summary: 'Redirect to Google sign-in' })
  async google(@Res() res: Response) {
    const { url, state, codeVerifier } = await this.auth.googleAuthUrl();
    const cookieOpts = {
      httpOnly: true,
      secure: this.tokens.cookieOptions(0).secure,
      sameSite: 'lax' as const,
      path: '/api/v1/auth/google',
      maxAge: 10 * 60 * 1000,
    };
    res.cookie('sd_oauth_state', state, cookieOpts);
    res.cookie('sd_oauth_verifier', codeVerifier, cookieOpts);
    res.redirect(url);
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth redirect target' })
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = await this.auth.googleCallback(
      code,
      state,
      req.cookies?.['sd_oauth_state'],
      req.cookies?.['sd_oauth_verifier'],
      meta(req),
    );
    res.clearCookie('sd_oauth_state', { path: '/api/v1/auth/google' });
    res.clearCookie('sd_oauth_verifier', { path: '/api/v1/auth/google' });
    this.startSession(res, session);
    res.redirect(session.home);
  }

  private startSession(res: Response, s: IssuedSession): AuthResponseDto {
    this.tokens.setAccessCookie(res, s.accessToken);
    this.tokens.setRefreshCookie(res, s.refreshToken);
    return { user: s.user, home: s.home };
  }
}

const meta = (req: Request) => ({ userAgent: req.headers['user-agent'], ip: req.ip });

/**
 * Only same-site page paths are allowed as a redirect target: "/customer" yes; "//evil.com",
 * "/\\evil.com", "https://…" and API paths no (open-redirect and loop protection).
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== 'string' || next.length > 512) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  // Backslashes and control characters can be read as "//" by browsers.
  if ([...next].some((ch) => ch === '\\' || ch.charCodeAt(0) < 0x20)) return null;
  if (next === '/api' || next.startsWith('/api/')) return null;
  return next;
}
