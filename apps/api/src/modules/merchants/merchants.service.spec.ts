import { HttpStatus } from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { AppError } from '../../common/errors/app-error';
import { MerchantsService } from './merchants.service';

describe('MerchantsService (Task Group 1)', () => {
  let service: MerchantsService;
  let prisma: any;
  let users: any;
  let audit: any;

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

    service = new MerchantsService(prisma, users, audit);
  });

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

      expect(res).toEqual({
        id: 'merch_789',
        businessName: 'Acme Logistics',
        contactEmail: 'merchant@test.com',
        contactPhone: '+94771234567',
        status: 'PENDING',
        approvedAt: undefined,
        approvedById: undefined,
        createdAt: mockMerchantRecord.createdAt,
      });
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

      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { ownerUserId: 'user_456' },
      });
      expect(res.id).toBe('merch_789');
      expect(res.status).toBe('PENDING');
    });

    it('throws 404 when merchant profile is not found', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.getMine(mockMerchantUser)).rejects.toThrow(AppError);
      await expect(service.getMine(mockMerchantUser)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('adminList', () => {
    it('lists merchants with pagination and optional status filter', async () => {
      prisma.merchant.findMany.mockResolvedValue([mockMerchantRecord]);
      prisma.merchant.count.mockResolvedValue(1);

      const res = await service.adminList({
        status: 'PENDING',
        page: 1,
        pageSize: 10,
        skip: 0,
        take: 10,
      });

      expect(prisma.merchant.findMany).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.merchant.count).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
      });
      expect(res.data).toHaveLength(1);
      expect(res.meta).toEqual({ page: 1, pageSize: 10, total: 1 });
    });
  });

  describe('approve', () => {
    it('approves a merchant and writes an audit log', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
      const approvedRecord = {
        ...mockMerchantRecord,
        status: 'APPROVED',
        approvedAt: new Date('2026-01-02T00:00:00.000Z'),
        approvedById: 'admin_123',
      };
      prisma.merchant.update.mockResolvedValue(approvedRecord);

      const res = await service.approve(mockAdmin, 'merch_789');

      expect(prisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'merch_789' },
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedById: 'admin_123',
        }),
      });

      expect(audit.record).toHaveBeenCalledWith(
        {
          actor: { id: 'admin_123', role: 'ADMIN' },
          action: 'merchant.approved',
          entityType: 'Merchant',
          entityId: 'merch_789',
          metadata: { previousStatus: 'PENDING' },
        },
        prisma,
      );

      expect(res.status).toBe('APPROVED');
      expect(res.approvedById).toBe('admin_123');
    });

    it('throws 404 when merchant does not exist', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.approve(mockAdmin, 'unknown')).rejects.toThrow(AppError);
    });
  });

  describe('reject', () => {
    it('rejects a merchant with reason and writes an audit log', async () => {
      prisma.merchant.findUnique.mockResolvedValue(mockMerchantRecord);
      const rejectedRecord = {
        ...mockMerchantRecord,
        status: 'REJECTED',
      };
      prisma.merchant.update.mockResolvedValue(rejectedRecord);

      const res = await service.reject(mockAdmin, 'merch_789', 'Invalid business documents');

      expect(prisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'merch_789' },
        data: { status: 'REJECTED' },
      });

      expect(audit.record).toHaveBeenCalledWith(
        {
          actor: { id: 'admin_123', role: 'ADMIN' },
          action: 'merchant.rejected',
          entityType: 'Merchant',
          entityId: 'merch_789',
          metadata: { reason: 'Invalid business documents', previousStatus: 'PENDING' },
        },
        prisma,
      );

      expect(res.status).toBe('REJECTED');
    });

    it('throws 404 when merchant does not exist', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.reject(mockAdmin, 'unknown', 'reason')).rejects.toThrow(AppError);
    });
  });

  describe('suspend', () => {
    it('suspends a merchant and writes an audit log', async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        ...mockMerchantRecord,
        status: 'APPROVED',
      });
      const suspendedRecord = {
        ...mockMerchantRecord,
        status: 'SUSPENDED',
      };
      prisma.merchant.update.mockResolvedValue(suspendedRecord);

      const res = await service.suspend(mockAdmin, 'merch_789');

      expect(prisma.merchant.update).toHaveBeenCalledWith({
        where: { id: 'merch_789' },
        data: { status: 'SUSPENDED' },
      });

      expect(audit.record).toHaveBeenCalledWith(
        {
          actor: { id: 'admin_123', role: 'ADMIN' },
          action: 'merchant.suspended',
          entityType: 'Merchant',
          entityId: 'merch_789',
          metadata: { previousStatus: 'APPROVED' },
        },
        prisma,
      );

      expect(res.status).toBe('SUSPENDED');
    });

    it('throws 404 when merchant does not exist', async () => {
      prisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.suspend(mockAdmin, 'unknown')).rejects.toThrow(AppError);
    });
  });
});

