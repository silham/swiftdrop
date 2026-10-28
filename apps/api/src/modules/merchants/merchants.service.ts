import { Injectable } from '@nestjs/common';
import type { Paginated } from '@swiftdrop/contracts';
import type { Merchant, MerchantStatus, Prisma } from '@swiftdrop/db';
import type { AuthUser } from '../../common/auth';
import { notFound, notImplemented } from '../../common/errors/app-error';
import { paginated } from '../../common/pagination/pagination';
import { PrismaService } from '../../infra/prisma';
import { AuditService } from '../audit';
import { UsersService } from '../users';
import type {
  CreateApiKeyDto,
  CreateWebhookDto,
  ListMerchantsQuery,
  MerchantDto,
  RegisterMerchantDto,
  UpdateWebhookDto,
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
    const merchant = await this.prisma.merchant.findUnique({
      where: { ownerUserId: user.id },
    });
    if (!merchant) throw notFound('Merchant');
    return this.toDto(merchant);
  }

  /**
   * PUBLIC (used by merchant-api ApiKeyGuard). Parse `sd_live_<prefix>_<secret>`, look up by prefix,
   * constant-time compare SHA-256 hash, reject revoked keys / non-APPROVED merchants, touch lastUsedAt.
   * Returns the merchantId or null.
   */
  async verifyApiKey(_rawKey: string): Promise<string | null> {
    notImplemented('M5');
  }

  async listApiKeys(_user: AuthUser) {
    notImplemented('M5');
  }
  async createApiKey(_user: AuthUser, _dto: CreateApiKeyDto) {
    notImplemented('M5');
  }
  async revokeApiKey(_user: AuthUser, _id: string) {
    notImplemented('M5');
  }

  async listWebhooks(_user: AuthUser) {
    notImplemented('M5');
  }
  async createWebhook(_user: AuthUser, _dto: CreateWebhookDto) {
    notImplemented('M5'); // TODO(M5): generate secret, encrypt with WEBHOOK_SECRET_ENC_KEY (AES-256-GCM)
  }
  async updateWebhook(_user: AuthUser, _id: string, _dto: UpdateWebhookDto) {
    notImplemented('M5');
  }
  async deleteWebhook(_user: AuthUser, _id: string) {
    notImplemented('M5');
  }
  async rotateWebhookSecret(_user: AuthUser, _id: string) {
    notImplemented('M5');
  }
  async listWebhookAttempts(_user: AuthUser, _id: string) {
    notImplemented('M5');
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
