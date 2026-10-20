import * as crypto from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, ROLE_HOME } from '@swiftdrop/contracts';
import type { User } from '@swiftdrop/db';
import * as argon2 from 'argon2';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { TokenService } from '../../common/auth';
import { AppError } from '../../common/errors/app-error';
import { InjectConfig, type Env } from '../../config/config.module';
import { PrismaService } from '../../infra/prisma';
import { UsersService } from '../users';
import type { AuthResponseDto, LoginDto, RegisterDto } from './dto/auth.dto';

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface IssuedSession extends AuthResponseDto {
  accessToken: string;
  refreshToken: string;
}

const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHRlc3R0ZXN0$dGVzdHRlc3R0ZXN0dGVzdHRlc3R0ZXN0dGVzdHRlc3Q';

/**
 * Owner: M2. Password auth, refresh-token rotation (RefreshSession, store only a SHA-256 hash),
 * Google OAuth (state + PKCE, verify id_token server-side). See docs/members/M02-auth-users.md.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    @InjectConfig() private readonly config: Env,
  ) {}

  async register(dto: RegisterDto, meta: SessionMeta): Promise<IssuedSession> {
    // Role is strictly CUSTOMER for public self-registration
    const user = await this.users.createUser({
      email: dto.email,
      name: dto.name,
      password: dto.password,
      phone: dto.phone,
      role: 'CUSTOMER',
    });

    return this.createSession(user, meta);
  }

  async login(dto: LoginDto, meta: SessionMeta): Promise<IssuedSession> {
    const user = await this.users.findByEmail(dto.email);

    if (!user || !user.passwordHash) {
      // Constant-time failure path against account enumeration
      await argon2.verify(DUMMY_HASH, dto.password).catch(() => false);
      throw new AppError(
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const isValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isValid) {
      throw new AppError(
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!user.isActive) {
      throw new AppError(
        ERROR_CODES.ACCOUNT_DISABLED,
        'Account has been disabled',
        HttpStatus.FORBIDDEN,
      );
    }

    return this.createSession(user, meta);
  }

  async refresh(refreshToken: string | undefined, meta: SessionMeta): Promise<IssuedSession> {
    if (!refreshToken) {
      throw new AppError(
        ERROR_CODES.UNAUTHENTICATED,
        'Refresh token is required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw new AppError(
        ERROR_CODES.UNAUTHENTICATED,
        'Invalid refresh session',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Token reuse detection: if revokedAt is set, this token was already rotated!
    // This indicates an attempted replay attack / token theft. Revoke entire session chain.
    if (session.revokedAt) {
      await this.prisma.refreshSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new AppError(
        ERROR_CODES.UNAUTHENTICATED,
        'Session compromised. All active sessions have been revoked.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (session.expiresAt < new Date()) {
      throw new AppError(
        ERROR_CODES.UNAUTHENTICATED,
        'Refresh session expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!session.user.isActive) {
      throw new AppError(
        ERROR_CODES.ACCOUNT_DISABLED,
        'Account has been disabled',
        HttpStatus.FORBIDDEN,
      );
    }

    // Rotate refresh token
    const nextTokenRaw = crypto.randomBytes(32).toString('base64url');
    const nextHash = crypto.createHash('sha256').update(nextTokenRaw).digest('hex');
    const expiresAt = new Date(Date.now() + this.config.JWT_REFRESH_TTL_DAYS * 86_400_000);

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: nextHash,
          userAgent: meta.userAgent,
          ip: meta.ip,
          expiresAt,
        },
      });

      await tx.refreshSession.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          replacedById: created.id,
        },
      });
    });

    const accessToken = await this.tokens.signAccessToken({
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    });

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
      },
      home: ROLE_HOME[session.user.role],
      accessToken,
      refreshToken: nextTokenRaw,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Returns the Google consent URL; stores state/PKCE verifier in a short-lived httpOnly cookie. */
  async googleAuthUrl(): Promise<{ url: string; state: string; codeVerifier: string }> {
    if (!this.config.GOOGLE_CLIENT_ID || !this.config.GOOGLE_CLIENT_SECRET) {
      throw new AppError(
        ERROR_CODES.NOT_IMPLEMENTED,
        'Google OAuth is not configured in this environment',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const client = new OAuth2Client(
      this.config.GOOGLE_CLIENT_ID,
      this.config.GOOGLE_CLIENT_SECRET,
      this.config.GOOGLE_CALLBACK_URL,
    );

    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = crypto.randomBytes(32).toString('base64url');

    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });

    return { url, state, codeVerifier };
  }

  async googleCallback(
    code: string,
    state: string,
    expectedState: string | undefined,
    codeVerifier: string | undefined,
    meta: SessionMeta,
  ): Promise<IssuedSession> {
    if (!this.config.GOOGLE_CLIENT_ID || !this.config.GOOGLE_CLIENT_SECRET) {
      throw new AppError(
        ERROR_CODES.NOT_IMPLEMENTED,
        'Google OAuth is not configured in this environment',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    if (!state || !expectedState || state !== expectedState || !codeVerifier) {
      throw new AppError(
        ERROR_CODES.UNAUTHENTICATED,
        'Invalid OAuth state or missing code verifier',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const client = new OAuth2Client(
      this.config.GOOGLE_CLIENT_ID,
      this.config.GOOGLE_CLIENT_SECRET,
      this.config.GOOGLE_CALLBACK_URL,
    );

    const { tokens } = await client.getToken({ code, codeVerifier });
    if (!tokens.id_token) {
      throw new AppError(
        ERROR_CODES.UNAUTHENTICATED,
        'Failed to obtain Google ID token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.config.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) {
      throw new AppError(
        ERROR_CODES.UNAUTHENTICATED,
        'Google account email is not verified',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const email = payload.email.toLowerCase().trim();

    // Check if OAuth account link already exists
    let user = await this.prisma.user.findFirst({
      where: {
        oauthAccounts: {
          some: { provider: 'google', providerAccountId: payload.sub },
        },
      },
    });

    if (!user) {
      // Check if user already exists with matching email
      const existing = await this.users.findByEmail(email);
      if (existing) {
        user = existing;
        await this.prisma.oAuthAccount.create({
          data: {
            userId: existing.id,
            provider: 'google',
            providerAccountId: payload.sub,
          },
        });
      } else {
        // Create new user as CUSTOMER
        user = await this.prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email,
              name: payload.name || email.split('@')[0],
              role: 'CUSTOMER',
              passwordHash: null,
            },
          });

          await tx.oAuthAccount.create({
            data: {
              userId: created.id,
              provider: 'google',
              providerAccountId: payload.sub,
            },
          });

          return created;
        });
      }
    }

    if (!user.isActive) {
      throw new AppError(
        ERROR_CODES.ACCOUNT_DISABLED,
        'Account has been disabled',
        HttpStatus.FORBIDDEN,
      );
    }

    return this.createSession(user, meta);
  }

  private async createSession(user: User, meta: SessionMeta): Promise<IssuedSession> {
    const rawRefreshToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + this.config.JWT_REFRESH_TTL_DAYS * 86_400_000);

    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash,
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt,
      },
    });

    const accessToken = await this.tokens.signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      home: ROLE_HOME[user.role],
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }
}
