import * as crypto from 'crypto';
import { HttpStatus } from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { AppError } from '../../common/errors/app-error';
import { decryptWebhookSecret } from './crypto';
import { MerchantsService } from './merchants.service';

describe('MerchantsService', () => {
  let service: MerchantsService;
  let prisma: any;
  let users: any;
  let audit: any;
  let config: any;

  const encKey = crypto.randomBytes(32).toString('base64');

  const mockAdmin: AuthUser = {
    id: 'admin_123',
    email: 'admin@swiftdrop.test',
    role: 'ADMIN',
  };

  const mockMerchantUser: AuthUser = {
    id: 'user_456',
    email: 'merchant@test.com',
    role: 'MERCHANT',
  };

  const mockMerchantRecord = {
    id: 'merch_789',
    ownerUserId: 'user_456',
    businessName: 'Acme Logistics',
    contactEmail: 'merchant@test.com',
    contactPhone: '+94771234567',
    status: 'PENDING' as const,
    approvedAt: null,
    approvedById: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      merchant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      apiKey: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      webhookEndpoint: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      webhookAttempt: {
        findMany: jest.fn(),
      },
      user: {
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    };

    users = {
      createUser: jest.fn(),
    };

    audit = {
      record: jest.fn(),
    };

    config = {
      WEBHOOK_SECRET_ENC_KEY: encKey,
      NODE_ENV: 'test',
    };

    service = new MerchantsService(prisma, users, audit, config);
  });

  describe('Task Group 1: Registration & Admin', () => {
    describe('register', () => {
      const registerDto = {
        businessName: '  Acme Logistics  ',
        contactName: 'John Doe',
        email: 'Merchant@Test.com',
        password: 'Password123!',
        contactPhone: ' +94771234567 ',
      };

      it('creates a user and a pending merchant', async () => {
        users.createUser.mockResolvedValue({ id: 'user_456' });
        prisma.merchant.create.mockResolvedValue(mockMerchantRecord);

        const res = await service.register(registerDto);

        expect(users.createUser).toHaveBeenCalledWith({
          email: 'Merchant@Test.com',
          name: 'John Doe',
          role: 'MERCHANT',
          password: 'Password123!',
          phone: ' +94771234567 ',
        });

        expect(prisma.merchant.create).toHaveBeenCalledWith({
          data: {
            ownerUserId: 'user_456',
            businessName: 'Acme Logistics',
            contactEmail: 'merchant@test.com',
            contactPhone: '+94771234567',
            status: 'PENDING',
          },
        });

        expect(res.status).toBe('PENDING');
      });

      it('rolls back created user if merchant creation fails', async () => {
        users.createUser.mockResolvedValue({ id: 'user_456' });
        prisma.merchant.create.mockRejectedValue(new Error('DB failure'));
        prisma.user.delete.mockResolvedValue({ id: 'user_456' });

        await expect(service.register(registerDto)).rejects.toThrow('DB failure');
        expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user_456' } });
      });
    });

    describe('getMine', () => {
      it('returns merchant profile for current user', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);

        const res = await service.getMine(mockMerchantUser);
        expect(res.id).toBe('merch_789');
        expect(res.status).toBe('PENDING');
      });

      it('throws 404 when merchant profile is not found', async () => {
        prisma.merchant.findUnique.mockResolvedValue(null);

        await expect(service.getMine(mockMerchantUser)).rejects.toThrow(AppError);
      });
    });

    describe('approve, reject, suspend', () => {
      it('approves a merchant and records audit log', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        prisma.merchant.update.mockResolvedValue({
          ...mockMerchantRecord,
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: 'admin_123',
        });

        const res = await service.approve(mockAdmin, 'merch_789');
        expect(res.status).toBe('APPROVED');
        expect(audit.record).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'merchant.approved' }),
          prisma,
        );
      });

      it('rejects a merchant with reason and records audit log', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        prisma.merchant.update.mockResolvedValue({
          ...mockMerchantRecord,
          status: 'REJECTED',
        });

        const res = await service.reject(mockAdmin, 'merch_789', 'Fraudulent docs');
        expect(res.status).toBe('REJECTED');
        expect(audit.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'merchant.rejected',
            metadata: { reason: 'Fraudulent docs', previousStatus: 'PENDING' },
          }),
          prisma,
        );
      });

      it('suspends a merchant and records audit log', async () => {
        prisma.merchant.findUnique.mockResolvedValue({
          ...mockMerchantRecord,
          status: 'APPROVED',
        });
        prisma.merchant.update.mockResolvedValue({
          ...mockMerchantRecord,
          status: 'SUSPENDED',
        });

        const res = await service.suspend(mockAdmin, 'merch_789');
        expect(res.status).toBe('SUSPENDED');
        expect(audit.record).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'merchant.suspended' }),
          prisma,
        );
      });
    });
  });

  describe('Task Group 2: API Keys', () => {
    describe('createApiKey', () => {
      it('generates raw key starting with sd_live_, stores prefix and hash, and returns raw key once', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        prisma.apiKey.create.mockImplementation(({ data }: any) => ({
          id: 'key_1',
          ...data,
          lastUsedAt: null,
          revokedAt: null,
          createdAt: new Date(),
        }));

        const res = await service.createApiKey(mockMerchantUser, { name: 'Production Shop' });

        expect(res.key).toMatch(/^sd_live_[a-f0-9]{8}_[A-Za-z0-9_-]+$/);
        expect(res.prefix).toMatch(/^sd_live_[a-f0-9]{8}$/);
        expect(res.name).toBe('Production Shop');

        expect(prisma.apiKey.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            merchantId: 'merch_789',
            name: 'Production Shop',
            prefix: res.prefix,
            keyHash: expect.any(String),
          }),
        });

        expect(audit.record).toHaveBeenCalledWith({
          actor: { id: 'user_456', role: 'MERCHANT' },
          action: 'api_key.created',
          entityType: 'ApiKey',
          entityId: 'key_1',
          metadata: { name: 'Production Shop', prefix: res.prefix },
        });
      });
    });

    describe('listApiKeys', () => {
      it('lists merchant keys without raw key or hash', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        prisma.apiKey.findMany.mockResolvedValue([
          {
            id: 'key_1',
            merchantId: 'merch_789',
            name: 'Shop 1',
            prefix: 'sd_live_12345678',
            keyHash: 'secret_hash',
            lastUsedAt: null,
            revokedAt: null,
            createdAt: new Date(),
          },
        ]);

        const res = await service.listApiKeys(mockMerchantUser);

        expect(res).toHaveLength(1);
        expect(res[0].prefix).toBe('sd_live_12345678');
        expect((res[0] as any).keyHash).toBeUndefined();
        expect((res[0] as any).key).toBeUndefined();
      });
    });

    describe('revokeApiKey', () => {
      it('revokes an API key owned by the merchant and records audit log', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        prisma.apiKey.findFirst.mockResolvedValue({
          id: 'key_1',
          merchantId: 'merch_789',
          prefix: 'sd_live_12345678',
          revokedAt: null,
        });

        await service.revokeApiKey(mockMerchantUser, 'key_1');

        expect(prisma.apiKey.update).toHaveBeenCalledWith({
          where: { id: 'key_1' },
          data: { revokedAt: expect.any(Date) },
        });

        expect(audit.record).toHaveBeenCalledWith({
          actor: { id: 'user_456', role: 'MERCHANT' },
          action: 'api_key.revoked',
          entityType: 'ApiKey',
          entityId: 'key_1',
          metadata: { prefix: 'sd_live_12345678' },
        });
      });

      it('throws 404 when key is not found or owned by another merchant', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        prisma.apiKey.findFirst.mockResolvedValue(null);

        await expect(service.revokeApiKey(mockMerchantUser, 'other_key')).rejects.toThrow(AppError);
      });
    });

    describe('verifyApiKey', () => {
      const rawKey = 'sd_live_12345678_dGVzdHNlY3JldA';
      const prefix = 'sd_live_12345678';
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      it('verifies a valid key for an approved merchant and returns merchantId', async () => {
        prisma.apiKey.findUnique.mockResolvedValue({
          id: 'key_1',
          merchantId: 'merch_789',
          prefix,
          keyHash,
          revokedAt: null,
          lastUsedAt: null,
          merchant: { status: 'APPROVED' },
        });
        prisma.apiKey.update.mockResolvedValue({});

        const merchantId = await service.verifyApiKey(rawKey);
        expect(merchantId).toBe('merch_789');
        expect(prisma.apiKey.update).toHaveBeenCalledWith({
          where: { id: 'key_1' },
          data: { lastUsedAt: expect.any(Date) },
        });
      });

      it('returns null for invalid key format or non-existent prefix', async () => {
        expect(await service.verifyApiKey('invalid-format')).toBeNull();

        prisma.apiKey.findUnique.mockResolvedValue(null);
        expect(await service.verifyApiKey(rawKey)).toBeNull();
      });

      it('returns null when hash does not match (wrong secret)', async () => {
        prisma.apiKey.findUnique.mockResolvedValue({
          id: 'key_1',
          merchantId: 'merch_789',
          prefix,
          keyHash: 'different_hash',
          revokedAt: null,
          merchant: { status: 'APPROVED' },
        });

        expect(await service.verifyApiKey(rawKey)).toBeNull();
      });

      it('returns null when key is revoked', async () => {
        prisma.apiKey.findUnique.mockResolvedValue({
          id: 'key_1',
          merchantId: 'merch_789',
          prefix,
          keyHash,
          revokedAt: new Date(),
          merchant: { status: 'APPROVED' },
        });

        expect(await service.verifyApiKey(rawKey)).toBeNull();
      });

      it('throws 403 MERCHANT_NOT_APPROVED when merchant is not APPROVED', async () => {
        prisma.apiKey.findUnique.mockResolvedValue({
          id: 'key_1',
          merchantId: 'merch_789',
          prefix,
          keyHash,
          revokedAt: null,
          merchant: { status: 'PENDING' },
        });

        await expect(service.verifyApiKey(rawKey)).rejects.toMatchObject({
          code: 'MERCHANT_NOT_APPROVED',
          status: HttpStatus.FORBIDDEN,
        });
      });
    });
  });

  describe('Task Group 2: Webhooks', () => {
    describe('createWebhook', () => {
      it('validates URL, generates and encrypts secret, and returns raw secret once', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        prisma.webhookEndpoint.create.mockImplementation(({ data }: any) => ({
          id: 'wh_1',
          ...data,
          createdAt: new Date(),
        }));

        const res = await service.createWebhook(mockMerchantUser, {
          url: 'https://myshop.com/webhooks',
          eventTypes: ['parcel.status_changed'],
        });

        expect(res.url).toBe('https://myshop.com/webhooks');
        expect(res.secret).toBeDefined();
        expect(typeof res.secret).toBe('string');

        // Check encryption in DB
        const createCall = prisma.webhookEndpoint.create.mock.calls[0][0];
        const encryptedInDb = createCall.data.secretEncrypted;
        expect(encryptedInDb).toBeDefined();
        expect(encryptedInDb).not.toBe(res.secret);

        // Verify it decrypts to the returned secret
        const decrypted = decryptWebhookSecret(encryptedInDb, encKey);
        expect(decrypted).toBe(res.secret);
      });

      it('rejects HTTP URL in production environment', async () => {
        config.NODE_ENV = 'production';
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);

        await expect(
          service.createWebhook(mockMerchantUser, { url: 'http://insecure.com/hook' }),
        ).rejects.toThrow('HTTPS in production');
      });
    });

    describe('rotateWebhookSecret', () => {
      it('generates new secret, archives old secret in previousSecretEncrypted, and records audit log', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        const oldSecretEncrypted = 'old_encrypted_val';
        prisma.webhookEndpoint.findFirst.mockResolvedValue({
          id: 'wh_1',
          merchantId: 'merch_789',
          url: 'https://myshop.com/webhooks',
          secretEncrypted: oldSecretEncrypted,
          previousSecretEncrypted: null,
          eventTypes: ['parcel.status_changed'],
          isActive: true,
          createdAt: new Date(),
        });
        prisma.webhookEndpoint.update.mockImplementation(({ data }: any) => ({
          id: 'wh_1',
          url: 'https://myshop.com/webhooks',
          eventTypes: ['parcel.status_changed'],
          isActive: true,
          createdAt: new Date(),
          ...data,
        }));

        const res = await service.rotateWebhookSecret(mockMerchantUser, 'wh_1');

        expect(res.secret).toBeDefined();

        expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith({
          where: { id: 'wh_1' },
          data: {
            secretEncrypted: expect.any(String),
            previousSecretEncrypted: oldSecretEncrypted,
          },
        });

        expect(audit.record).toHaveBeenCalledWith({
          actor: { id: 'user_456', role: 'MERCHANT' },
          action: 'webhook_secret.rotated',
          entityType: 'WebhookEndpoint',
          entityId: 'wh_1',
        });
      });
    });

    describe('updateWebhook & deleteWebhook', () => {
      it('updates webhook status or URL', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        prisma.webhookEndpoint.findFirst.mockResolvedValue({
          id: 'wh_1',
          merchantId: 'merch_789',
        });
        prisma.webhookEndpoint.update.mockResolvedValue({
          id: 'wh_1',
          url: 'https://myshop.com/new-hook',
          eventTypes: ['parcel.status_changed'],
          isActive: false,
          createdAt: new Date(),
        });

        const res = await service.updateWebhook(mockMerchantUser, 'wh_1', {
          url: 'https://myshop.com/new-hook',
          isActive: false,
        });

        expect(res.isActive).toBe(false);
        expect(res.url).toBe('https://myshop.com/new-hook');
      });

      it('deletes webhook endpoint', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        prisma.webhookEndpoint.findFirst.mockResolvedValue({
          id: 'wh_1',
          merchantId: 'merch_789',
        });

        await service.deleteWebhook(mockMerchantUser, 'wh_1');
        expect(prisma.webhookEndpoint.delete).toHaveBeenCalledWith({ where: { id: 'wh_1' } });
      });
    });

    describe('listWebhookAttempts', () => {
      it('returns attempts for endpoint', async () => {
        prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
        prisma.webhookEndpoint.findFirst.mockResolvedValue({
          id: 'wh_1',
          merchantId: 'merch_789',
        });
        prisma.webhookAttempt.findMany.mockResolvedValue([
          { id: 'att_1', status: 'SUCCEEDED', responseStatus: 200 },
        ]);

        const attempts = await service.listWebhookAttempts(mockMerchantUser, 'wh_1');
        expect(attempts).toHaveLength(1);
        expect(attempts[0].status).toBe('SUCCEEDED');
      });
    });
  });
});
