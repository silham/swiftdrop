import * as crypto from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, type Paginated } from '@swiftdrop/contracts';
import type { ApiKey, Merchant, MerchantStatus, Prisma, WebhookEndpoint } from '@swiftdrop/db';
import type { AuthUser } from '../../common/auth';
import { AppError, notFound } from '../../common/errors/app-error';
import { paginated } from '../../common/pagination/pagination';
import { InjectConfig } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma';
import { AuditService } from '../audit';
import { UsersService } from '../users';
import { encryptWebhookSecret } from './crypto';
import type {
  ApiKeyDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
  CreateWebhookDto,
  ListMerchantsQuery,
  MerchantDto,
  RegisterMerchantDto,
  UpdateWebhookDto,
  WebhookDto,
  WebhookWithSecretDto,
} from './dto/merchant.dto';

/**
 * Merchant accounts, approval, API keys and webhook endpoints. Owner: M5.
 * Tenancy rule: the merchant is ALWAYS derived from the session (`ownerUserId = user.id`) or the
 * API key — never from a request body/param.
 */
@Injectable()
export class MerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    @InjectConfig() private readonly config: Env,
  ) {}

  private toDto(merchant: Merchant): MerchantDto {
    return {
      id: merchant.id,
      businessName: merchant.businessName,
      contactEmail: merchant.contactEmail,
      contactPhone: merchant.contactPhone ?? undefined,
      status: merchant.status,
      approvedAt: merchant.approvedAt ?? undefined,
      approvedById: merchant.approvedById ?? undefined,
      createdAt: merchant.createdAt,
    };
  }

  private toApiKeyDto(key: ApiKey): ApiKeyDto {
    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
    };
  }

  private toWebhookDto(ep: WebhookEndpoint): WebhookDto {
    return {
      id: ep.id,
      url: ep.url,
      eventTypes: ep.eventTypes,
      isActive: ep.isActive,
      createdAt: ep.createdAt,
    };
  }

  private async getMerchantForUser(userId: string): Promise<Merchant> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { ownerUserId: userId },
    });
    if (!merchant) throw notFound('Merchant');
    return merchant;
  }

  private validateWebhookUrl(urlStr: string): void {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new AppError(ERROR_CODES.BAD_REQUEST, 'Invalid webhook URL', HttpStatus.BAD_REQUEST);
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new AppError(
        ERROR_CODES.BAD_REQUEST,
        'Webhook URL must use HTTP or HTTPS protocol',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (this.config.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new AppError(
        ERROR_CODES.BAD_REQUEST,
        'Webhook URL must use HTTPS in production',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async register(dto: RegisterMerchantDto): Promise<MerchantDto> {
    const user = await this.users.createUser({
      email: dto.email,
      name: dto.contactName,
      role: 'MERCHANT',
      password: dto.password,
      phone: dto.contactPhone,
    });

    try {
      const merchant = await this.prisma.merchant.create({
        data: {
          ownerUserId: user.id,
          businessName: dto.businessName.trim(),
          contactEmail: dto.email.toLowerCase().trim(),
          contactPhone: dto.contactPhone?.trim() || null,
          status: 'PENDING',
        },
      });
      return this.toDto(merchant);
    } catch (err) {
      // Rollback user creation if merchant record creation fails
      await this.prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      throw err;
    }
  }

  async getMine(user: AuthUser): Promise<MerchantDto> {
    const merchant = await this.getMerchantForUser(user.id);
    return this.toDto(merchant);
  }

  /**
   * PUBLIC (used by merchant-api ApiKeyGuard). Parse `sd_live_<prefix>_<secret>`, look up by prefix,
   * constant-time compare SHA-256 hash, reject revoked keys / non-APPROVED merchants, touch lastUsedAt.
   * Returns the merchantId or null.
   */
  async verifyApiKey(rawKey: string): Promise<string | null> {
    const match = rawKey.match(/^(sd_live_[a-zA-Z0-9]{8})_.+$/);
    if (!match) return null;
    const prefix = match[1];

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { prefix },
      include: { merchant: true },
    });
    if (!apiKey) return null;

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const hashBuffer = Buffer.from(keyHash, 'utf8');
    const storedBuffer = Buffer.from(apiKey.keyHash, 'utf8');

    if (
      hashBuffer.length !== storedBuffer.length ||
      !crypto.timingSafeEqual(hashBuffer, storedBuffer)
    ) {
      return null;
    }

    if (apiKey.revokedAt !== null) {
      return null;
    }

    if (apiKey.merchant.status !== 'APPROVED') {
      throw new AppError(
        ERROR_CODES.MERCHANT_NOT_APPROVED,
        'Merchant account is not approved',
        HttpStatus.FORBIDDEN,
      );
    }

    const now = new Date();
    const ONE_MINUTE_MS = 60 * 1000;
    if (!apiKey.lastUsedAt || now.getTime() - apiKey.lastUsedAt.getTime() > ONE_MINUTE_MS) {
      await this.prisma.apiKey
        .update({
          where: { id: apiKey.id },
          data: { lastUsedAt: now },
        })
        .catch(() => {});
    }

    return apiKey.merchantId;
  }

  async listApiKeys(user: AuthUser): Promise<ApiKeyDto[]> {
    const merchant = await this.getMerchantForUser(user.id);
    const keys = await this.prisma.apiKey.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((k) => this.toApiKeyDto(k));
  }

  async createApiKey(user: AuthUser, dto: CreateApiKeyDto): Promise<CreatedApiKeyDto> {
    const merchant = await this.getMerchantForUser(user.id);

    const prefixPart = crypto.randomBytes(4).toString('hex');
    const prefix = `sd_live_${prefixPart}`;
    const secretPart = crypto.randomBytes(32).toString('base64url');
    const rawKey = `${prefix}_${secretPart}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.create({
      data: {
        merchantId: merchant.id,
        name: dto.name.trim(),
        prefix,
        keyHash,
      },
    });

    await this.audit.record({
      actor: { id: user.id, role: user.role },
      action: 'api_key.created',
      entityType: 'ApiKey',
      entityId: apiKey.id,
      metadata: { name: apiKey.name, prefix: apiKey.prefix },
    });

    return {
      ...this.toApiKeyDto(apiKey),
      key: rawKey,
    };
  }

  async revokeApiKey(user: AuthUser, id: string): Promise<void> {
    const merchant = await this.getMerchantForUser(user.id);
    const key = await this.prisma.apiKey.findFirst({
      where: { id, merchantId: merchant.id },
    });
    if (!key) throw notFound('ApiKey');

    if (key.revokedAt) return;

    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      actor: { id: user.id, role: user.role },
      action: 'api_key.revoked',
      entityType: 'ApiKey',
      entityId: id,
      metadata: { prefix: key.prefix },
    });
  }

  async listWebhooks(user: AuthUser): Promise<WebhookDto[]> {
    const merchant = await this.getMerchantForUser(user.id);
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: 'desc' },
    });
    return endpoints.map((ep) => this.toWebhookDto(ep));
  }

  async createWebhook(user: AuthUser, dto: CreateWebhookDto): Promise<WebhookWithSecretDto> {
    const merchant = await this.getMerchantForUser(user.id);

    this.validateWebhookUrl(dto.url);

    const rawSecret = crypto.randomBytes(32).toString('hex');
    const secretEncrypted = encryptWebhookSecret(rawSecret, this.config.WEBHOOK_SECRET_ENC_KEY);

    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        merchantId: merchant.id,
        url: dto.url.trim(),
        secretEncrypted,
        eventTypes:
          dto.eventTypes && dto.eventTypes.length > 0
            ? dto.eventTypes
            : ['parcel.status_changed'],
        isActive: true,
      },
    });

    return {
      ...this.toWebhookDto(endpoint),
      secret: rawSecret,
    };
  }

  async updateWebhook(user: AuthUser, id: string, dto: UpdateWebhookDto): Promise<WebhookDto> {
    const merchant = await this.getMerchantForUser(user.id);
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, merchantId: merchant.id },
    });
    if (!existing) throw notFound('WebhookEndpoint');

    if (dto.url) {
      this.validateWebhookUrl(dto.url);
    }

    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        url: dto.url?.trim() ?? undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });

    return this.toWebhookDto(updated);
  }

  async deleteWebhook(user: AuthUser, id: string): Promise<void> {
    const merchant = await this.getMerchantForUser(user.id);
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, merchantId: merchant.id },
    });
    if (!existing) throw notFound('WebhookEndpoint');

    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  async rotateWebhookSecret(user: AuthUser, id: string): Promise<WebhookWithSecretDto> {
    const merchant = await this.getMerchantForUser(user.id);
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, merchantId: merchant.id },
    });
    if (!existing) throw notFound('WebhookEndpoint');

    const newRawSecret = crypto.randomBytes(32).toString('hex');
    const newEncrypted = encryptWebhookSecret(newRawSecret, this.config.WEBHOOK_SECRET_ENC_KEY);

    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        secretEncrypted: newEncrypted,
        previousSecretEncrypted: existing.secretEncrypted,
      },
    });

    await this.audit.record({
      actor: { id: user.id, role: user.role },
      action: 'webhook_secret.rotated',
      entityType: 'WebhookEndpoint',
      entityId: id,
    });

    return {
      ...this.toWebhookDto(updated),
      secret: newRawSecret,
    };
  }

  async listWebhookAttempts(user: AuthUser, id: string) {
    const merchant = await this.getMerchantForUser(user.id);
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, merchantId: merchant.id },
    });
    if (!existing) throw notFound('WebhookEndpoint');

    return this.prisma.webhookAttempt.findMany({
      where: { endpointId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getMyParcels(user: AuthUser, q: PaginationQuery, status?: string) {
    const merchant = await this.getMerchantForUser(user.id);
    const where: Prisma.ParcelWhereInput = {
      merchantId: merchant.id,
      ...(status ? { status: status as any } : {}),
    };
    const [parcels, total] = await Promise.all([
      this.prisma.parcel.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.parcel.count({ where }),
    ]);

    return paginated(
      parcels.map((p) => ({
        id: p.id,
        trackingNumber: p.trackingNumber,
        merchantReference: p.merchantReference ?? undefined,
        status: p.status,
        senderName: p.senderName,
        recipientName: p.recipientName,
        dropoffCity: p.dropoffCity,
        feeCents: p.feeCents,
        currency: p.currency,
        createdAt: p.createdAt,
      })),
      total,
      q,
    );
  }

  async getMyStats(user: AuthUser) {
    const merchant = await this.getMerchantForUser(user.id);
    const counts = await this.prisma.parcel.groupBy({
      by: ['status'],
      where: { merchantId: merchant.id },
      _count: true,
    });

    const summary: Record<string, number> = {
      TOTAL: 0,
      CREATED: 0,
      PICKED_UP: 0,
      IN_TRANSIT: 0,
      OUT_FOR_DELIVERY: 0,
      DELIVERED: 0,
      FAILED: 0,
    };

    for (const c of counts) {
      summary[c.status] = c._count;
      summary.TOTAL += c._count;
    }

    return summary;
  }

  // admin
  async adminList(q: ListMerchantsQuery): Promise<Paginated<MerchantDto>> {
    const where: Prisma.MerchantWhereInput = q.status
      ? { status: q.status as MerchantStatus }
      : {};

    const [merchants, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return paginated(
      merchants.map((m) => this.toDto(m)),
      total,
      q,
    );
  }

  async approve(admin: AuthUser, id: string): Promise<MerchantDto> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw notFound('Merchant');

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.merchant.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: admin.id,
        },
      });
      await this.audit.record(
        {
          actor: { id: admin.id, role: admin.role },
          action: 'merchant.approved',
          entityType: 'Merchant',
          entityId: id,
          metadata: { previousStatus: merchant.status },
        },
        tx,
      );
      return res;
    });

    return this.toDto(updated);
  }

  async reject(admin: AuthUser, id: string, reason?: string): Promise<MerchantDto> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw notFound('Merchant');

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.merchant.update({
        where: { id },
        data: {
          status: 'REJECTED',
        },
      });
      await this.audit.record(
        {
          actor: { id: admin.id, role: admin.role },
          action: 'merchant.rejected',
          entityType: 'Merchant',
          entityId: id,
          metadata: { reason: reason ?? null, previousStatus: merchant.status },
        },
        tx,
      );
      return res;
    });

    return this.toDto(updated);
  }

  async suspend(admin: AuthUser, id: string): Promise<MerchantDto> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw notFound('Merchant');

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.merchant.update({
        where: { id },
        data: {
          status: 'SUSPENDED',
        },
      });
      await this.audit.record(
        {
          actor: { id: admin.id, role: admin.role },
          action: 'merchant.suspended',
          entityType: 'Merchant',
          entityId: id,
          metadata: { previousStatus: merchant.status },
        },
        tx,
      );
      return res;
    });

    return this.toDto(updated);
  }
}
