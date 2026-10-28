import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { MerchantApiService } from './merchant-api.service';

describe('MerchantApiService', () => {
  let service: MerchantApiService;
  let prisma: any;
  let parcels: any;

  const mockMerchantId = 'merch_123';
  const mockParcel = {
    id: 'parcel_1',
    trackingNumber: 'SD100000001',
    status: 'CREATED' as const,
    merchantId: mockMerchantId,
    merchantReference: 'ORDER-999',
    senderName: 'Lanka Books',
    senderPhone: '+94771234567',
    pickupAddress: '10 Galle Road',
    pickupCity: 'colombo',
    recipientName: 'Kamal Perera',
    recipientPhone: '+94779876543',
    dropoffAddress: '25 Kandy Road',
    dropoffCity: 'kandy',
    size: 'SMALL' as const,
    weightKg: 1.5,
    feeCents: 45000,
    currency: 'LKR',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deliveredAt: null,
  };

  const createDto = {
    merchantReference: 'ORDER-999',
    senderName: 'Lanka Books',
    senderPhone: '+94771234567',
    pickupAddress: '10 Galle Road',
    pickupCity: 'colombo',
    recipientName: 'Kamal Perera',
    recipientPhone: '+94779876543',
    dropoffAddress: '25 Kandy Road',
    dropoffCity: 'kandy',
    size: 'SMALL' as const,
    weightKg: 1.5,
  };

  beforeEach(() => {
    prisma = {
      parcel: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    parcels = {
      create: jest.fn(),
      findByTrackingNumber: jest.fn(),
    };

    service = new MerchantApiService(prisma, parcels);
  });

  describe('createParcel (Idempotency)', () => {
    it('returns existing parcel with isExisting=true when (merchantId, merchantReference) exists', async () => {
      prisma.parcel.findUnique.mockResolvedValue(mockParcel);

      const result = await service.createParcel(mockMerchantId, createDto);

      expect(prisma.parcel.findUnique).toHaveBeenCalledWith({
        where: {
          merchantId_merchantReference: {
            merchantId: mockMerchantId,
            merchantReference: 'ORDER-999',
          },
        },
      });
      expect(parcels.create).not.toHaveBeenCalled();
      expect(result.isExisting).toBe(true);
      expect(result.parcel.trackingNumber).toBe('SD100000001');
    });

    it('creates new parcel with isExisting=false when not previously created', async () => {
      prisma.parcel.findUnique.mockResolvedValue(null);
      parcels.create.mockResolvedValue(mockParcel);

      const result = await service.createParcel(mockMerchantId, createDto);

      expect(parcels.create).toHaveBeenCalledWith(
        {
          ...createDto,
          source: 'MERCHANT_API',
          merchantId: mockMerchantId,
          merchantReference: 'ORDER-999',
        },
        'MERCHANT',
      );
      expect(result.isExisting).toBe(false);
      expect(result.parcel.trackingNumber).toBe('SD100000001');
    });

    it('handles race condition on unique constraint error and returns existing parcel', async () => {
      prisma.parcel.findUnique
        .mockResolvedValueOnce(null) // first check returns null
        .mockResolvedValueOnce(mockParcel); // second check after conflict returns existing

      const uniqueConstraintError: any = new Error('Unique constraint failed');
      uniqueConstraintError.code = 'P2002';
      parcels.create.mockRejectedValue(uniqueConstraintError);

      const result = await service.createParcel(mockMerchantId, createDto);

      expect(result.isExisting).toBe(true);
      expect(result.parcel.trackingNumber).toBe('SD100000001');
    });
  });

  describe('listParcels', () => {
    it('lists only parcels belonging to this merchant with pagination', async () => {
      prisma.parcel.findMany.mockResolvedValue([mockParcel]);
      prisma.parcel.count.mockResolvedValue(1);

      const res = await service.listParcels(mockMerchantId, {
        page: 1,
        pageSize: 10,
        skip: 0,
        take: 10,
      });

      expect(prisma.parcel.findMany).toHaveBeenCalledWith({
        where: { merchantId: mockMerchantId },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].trackingNumber).toBe('SD100000001');
      expect(res.meta.total).toBe(1);
    });
  });

  describe('getParcel', () => {
    it('returns parcel when owned by this merchant', async () => {
      prisma.parcel.findUnique.mockResolvedValue(mockParcel);

      const res = await service.getParcel(mockMerchantId, 'SD100000001');

      expect(res.trackingNumber).toBe('SD100000001');
      expect(res.recipientCity).toBeUndefined(); // private/detailed view
    });

    it('throws 404 when parcel does not exist', async () => {
      prisma.parcel.findUnique.mockResolvedValue(null);

      await expect(service.getParcel(mockMerchantId, 'SD999999999')).rejects.toThrow(AppError);
    });

    it('throws 404 when parcel belongs to a DIFFERENT merchant (cross-merchant isolation)', async () => {
      const otherMerchantParcel = {
        ...mockParcel,
        merchantId: 'other_merchant_999',
      };
      prisma.parcel.findUnique.mockResolvedValue(otherMerchantParcel);

      await expect(service.getParcel(mockMerchantId, 'SD100000001')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });
});

