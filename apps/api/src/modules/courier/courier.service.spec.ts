import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from '@swiftdrop/contracts';
import { Readable } from 'node:stream';
import type { AuthUser } from '../../common/auth';
import { CourierService } from './courier.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);

const courier: AuthUser = { id: 'courier-1', email: 'c1@x.test', role: 'COURIER' };
const otherCourier: AuthUser = { id: 'courier-2', email: 'c2@x.test', role: 'COURIER' };

const parcel = {
  id: 'parcel-1',
  trackingNumber: 'SD123456789',
  status: 'OUT_FOR_DELIVERY',
  deliveryAttempts: 1,
  senderName: 's',
  senderPhone: '1',
  pickupAddress: 'a',
  pickupCity: 'colombo',
  recipientName: 'r',
  recipientPhone: '2',
  dropoffAddress: 'b',
  dropoffCity: 'kandy',
  size: 'SMALL',
  weightKg: 1.5,
  description: null,
  customerId: 'customer-1',
};

const activeAssignment = {
  id: 'assign-1',
  parcelId: 'parcel-1',
  courierId: 'courier-1',
  status: 'ACTIVE',
  assignedAt: new Date(),
};

function photo(buffer: Buffer, size = buffer.length) {
  return { buffer, size } as Express.Multer.File;
}

describe('CourierService (Unit)', () => {
  let service: CourierService;
  let prisma: any;
  let parcels: any;
  let dispatch: any;
  let storage: any;

  beforeEach(() => {
    prisma = {
      parcel: { findUniqueOrThrow: jest.fn().mockResolvedValue(parcel) },
      courierAssignment: {
        findFirstOrThrow: jest.fn().mockResolvedValue(activeAssignment),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      proofOfDelivery: { create: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    parcels = {
      transition: jest.fn().mockResolvedValue({ ...parcel, status: 'DELIVERED' }),
      getHistory: jest.fn().mockResolvedValue([]),
    };
    dispatch = {
      getActiveAssignment: jest.fn().mockResolvedValue(activeAssignment),
      completeAssignment: jest.fn(),
    };
    storage = {
      put: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(Readable.from(['x'])),
    };
    service = new CourierService(prisma, parcels, dispatch, storage, {
      UPLOAD_MAX_BYTES: 1024,
    } as never);
  });

  describe('authorization', () => {
    it('returns 404 when the parcel is assigned to another courier', async () => {
      await expect(service.getAssigned(otherCourier, 'parcel-1')).rejects.toMatchObject({
        code: ERROR_CODES.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
      await expect(
        service.updateStatus(otherCourier, 'parcel-1', { status: 'FAILED' }),
      ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
      expect(parcels.transition).not.toHaveBeenCalled();
    });

    it('returns 404 when the parcel has no active assignment and I never finished it', async () => {
      dispatch.getActiveAssignment.mockResolvedValue(null);
      await expect(service.getAssigned(courier, 'parcel-1')).rejects.toMatchObject({
        code: ERROR_CODES.NOT_FOUND,
      });
    });

    it('lets me open a parcel I finished, with no actions left', async () => {
      dispatch.getActiveAssignment.mockResolvedValue(null);
      prisma.courierAssignment.findFirst.mockResolvedValue({
        ...activeAssignment,
        status: 'COMPLETED',
      });
      prisma.parcel.findUniqueOrThrow.mockResolvedValue({ ...parcel, status: 'DELIVERED' });
      const res = await service.getAssigned(courier, 'parcel-1');
      expect(res).toMatchObject({ status: 'DELIVERED', nextStatuses: [], canDeliver: false });
      expect(prisma.courierAssignment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ courierId: 'courier-1' }) }),
      );
    });
  });

  describe('updateStatus', () => {
    it('delegates to ParcelsService.transition inside a transaction', async () => {
      parcels.transition.mockResolvedValue({ ...parcel, status: 'FAILED', deliveryAttempts: 1 });
      await service.updateStatus(courier, 'parcel-1', {
        status: 'FAILED',
        failureReason: 'REFUSED',
      });
      expect(parcels.transition).toHaveBeenCalledWith('parcel-1', {
        to: 'FAILED',
        actor: { id: 'courier-1', role: 'COURIER' },
        failureReason: 'REFUSED',
        note: undefined,
        tx: prisma,
      });
      // Attempts left: the courier keeps the parcel for a re-attempt.
      expect(dispatch.completeAssignment).not.toHaveBeenCalled();
    });

    it('completes the assignment when the last allowed attempt fails', async () => {
      parcels.transition.mockResolvedValue({ ...parcel, status: 'FAILED', deliveryAttempts: 3 });
      await service.updateStatus(courier, 'parcel-1', {
        status: 'FAILED',
        failureReason: 'RECIPIENT_UNAVAILABLE',
      });
      expect(dispatch.completeAssignment).toHaveBeenCalledWith('parcel-1', prisma);
    });
  });

  describe('submitProof', () => {
    it('stores the photo, then writes proof + DELIVERED + completes the assignment', async () => {
      await service.submitProof(courier, 'parcel-1', { recipientName: 'Kamal' }, photo(PNG));

      expect(storage.put).toHaveBeenCalledWith(
        expect.stringMatching(/^pod\/parcel-1\/[0-9a-f-]{36}\.png$/),
        PNG,
        'image/png',
      );
      expect(prisma.proofOfDelivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parcelId: 'parcel-1',
          courierId: 'courier-1',
          recipientName: 'Kamal',
        }),
      });
      expect(parcels.transition).toHaveBeenCalledWith(
        'parcel-1',
        expect.objectContaining({ to: 'DELIVERED', tx: prisma }),
      );
      expect(dispatch.completeAssignment).toHaveBeenCalledWith('parcel-1', prisma);
    });

    it('deletes the stored photo when the transaction fails', async () => {
      parcels.transition.mockRejectedValue(new Error('boom'));
      await expect(
        service.submitProof(courier, 'parcel-1', { recipientName: 'Kamal' }, photo(PNG)),
      ).rejects.toThrow('boom');
      const [key] = storage.put.mock.calls[0];
      expect(storage.remove).toHaveBeenCalledWith(key);
    });

    it('rejects a missing photo (422), a non-image (400) and an oversized file (413)', async () => {
      await expect(
        service.submitProof(courier, 'parcel-1', { recipientName: 'Kamal' }),
      ).rejects.toMatchObject({ code: ERROR_CODES.PROOF_REQUIRED, status: 422 });

      await expect(
        service.submitProof(
          courier,
          'parcel-1',
          { recipientName: 'Kamal' },
          photo(Buffer.from('not an image, just text....')),
        ),
      ).rejects.toMatchObject({ code: ERROR_CODES.UNSUPPORTED_FILE, status: 400 });

      await expect(
        service.submitProof(courier, 'parcel-1', { recipientName: 'Kamal' }, photo(PNG, 2048)),
      ).rejects.toMatchObject({ code: ERROR_CODES.FILE_TOO_LARGE, status: 413 });

      expect(storage.put).not.toHaveBeenCalled();
    });

    it('refuses proof before the parcel is out for delivery, without storing anything', async () => {
      prisma.parcel.findUniqueOrThrow.mockResolvedValue({ ...parcel, status: 'IN_TRANSIT' });
      await expect(
        service.submitProof(courier, 'parcel-1', { recipientName: 'Kamal' }, photo(PNG)),
      ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_STATUS_TRANSITION, status: 409 });
      expect(storage.put).not.toHaveBeenCalled();
    });
  });

  describe('proofPhoto', () => {
    beforeEach(() => {
      prisma.proofOfDelivery.findUnique.mockResolvedValue({
        photoKey: 'pod/parcel-1/abc.png',
        courierId: 'courier-1',
        parcel: { customerId: 'customer-1' },
      });
    });

    it.each([
      ['admin', { id: 'a', email: 'a', role: 'ADMIN' }],
      ['dispatcher', { id: 'd', email: 'd', role: 'DISPATCHER' }],
      ['capturing courier', courier],
      ['owning customer', { id: 'customer-1', email: 'c', role: 'CUSTOMER' }],
    ] as const)('streams the photo for the %s', async (_label, user) => {
      const res = await service.proofPhoto(user as AuthUser, 'parcel-1');
      expect(res.contentType).toBe('image/png');
      expect(storage.get).toHaveBeenCalledWith('pod/parcel-1/abc.png');
    });

    it.each([
      ['another customer', { id: 'customer-2', email: 'c2', role: 'CUSTOMER' }],
      ['another courier', otherCourier],
      ['a merchant', { id: 'm', email: 'm', role: 'MERCHANT' }],
    ] as const)('returns 404 for %s', async (_label, user) => {
      await expect(service.proofPhoto(user as AuthUser, 'parcel-1')).rejects.toMatchObject({
        code: ERROR_CODES.NOT_FOUND,
      });
      expect(storage.get).not.toHaveBeenCalled();
    });

    it('returns 404 when there is no proof yet', async () => {
      prisma.proofOfDelivery.findUnique.mockResolvedValue(null);
      await expect(service.proofPhoto(courier, 'parcel-1')).rejects.toMatchObject({
        code: ERROR_CODES.NOT_FOUND,
      });
    });
  });
});
