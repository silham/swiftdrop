import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from '@swiftdrop/contracts';
import { DispatchService } from './dispatch.service';

describe('DispatchService (Unit)', () => {
  let service: DispatchService;
  let prismaMock: any;
  let auditMock: any;
  let outboxMock: any;

  const mockDispatcher = {
    id: 'dispatcher-1',
    role: 'DISPATCHER' as const,
    email: 'dispatcher@swiftdrop.test',
  };

  const mockCourierUser = {
    id: 'courier-1',
    name: 'Kasun Courier',
    email: 'courier@swiftdrop.test',
    role: 'COURIER',
    isActive: true,
    courierProfile: {
      id: 'profile-1',
      userId: 'courier-1',
      zoneId: 'zone-cmb',
      isAvailable: true,
      maxActiveParcels: 5,
    },
  };

  const mockParcel = {
    id: 'parcel-1',
    trackingNumber: 'SD123456789',
    status: 'CREATED',
    pickupCity: 'colombo',
    dropoffCity: 'kandy',
    size: 'SMALL',
    weightKg: 1.5,
    feeCents: 45000,
    currency: 'LKR',
  };

  beforeEach(() => {
    prismaMock = {
      parcel: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      courierAssignment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
    };

    auditMock = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    outboxMock = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    service = new DispatchService(prismaMock, auditMock, outboxMock);
  });

  describe('Courier Assignment', () => {
    it('successfully assigns an unassigned CREATED parcel to an available courier', async () => {
      prismaMock.parcel.findUnique.mockResolvedValue(mockParcel);
      prismaMock.courierAssignment.findFirst.mockResolvedValue(null); // No existing active assignment
      prismaMock.user.findUnique.mockResolvedValue(mockCourierUser);
      prismaMock.courierAssignment.count.mockResolvedValue(2); // 2 < maxActiveParcels (5)

      const createdAssignment = {
        id: 'assign-1',
        parcelId: mockParcel.id,
        courierId: mockCourierUser.id,
        assignedById: mockDispatcher.id,
        status: 'ACTIVE',
        assignedAt: new Date(),
      };
      prismaMock.courierAssignment.create.mockResolvedValue(createdAssignment);

      const result = await service.assign(mockDispatcher, {
        parcelId: mockParcel.id,
        courierId: mockCourierUser.id,
      });

      expect(result.id).toBe('assign-1');
      expect(result.status).toBe('ACTIVE');

      // Verify audit recorded
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'parcel.assigned',
          entityType: 'parcel',
          entityId: mockParcel.id,
          actor: { id: mockDispatcher.id, role: mockDispatcher.role },
        }),
        prismaMock,
      );

      // Verify outbox domain event enqueued
      expect(outboxMock.enqueue).toHaveBeenCalledWith(
        prismaMock,
        'parcel.courier_assigned',
        expect.objectContaining({
          parcelId: mockParcel.id,
          trackingNumber: mockParcel.trackingNumber,
          courierId: mockCourierUser.id,
          assignedById: mockDispatcher.id,
        }),
      );
    });

    it('rejects assignment with ALREADY_ASSIGNED (409) if parcel already has an ACTIVE assignment', async () => {
      prismaMock.parcel.findUnique.mockResolvedValue(mockParcel);
      prismaMock.courierAssignment.findFirst.mockResolvedValue({
        id: 'existing-active-assignment',
        parcelId: mockParcel.id,
        status: 'ACTIVE',
      });

      await expect(
        service.assign(mockDispatcher, {
          parcelId: mockParcel.id,
          courierId: mockCourierUser.id,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.ALREADY_ASSIGNED,
          status: HttpStatus.CONFLICT,
        }),
      );
    });

    it('rejects assignment with COURIER_UNAVAILABLE if courier active workload is at maximum capacity', async () => {
      prismaMock.parcel.findUnique.mockResolvedValue(mockParcel);
      prismaMock.courierAssignment.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(mockCourierUser);
      // Courier already has 5 active parcels out of 5 maxActiveParcels
      prismaMock.courierAssignment.count.mockResolvedValue(5);

      await expect(
        service.assign(mockDispatcher, {
          parcelId: mockParcel.id,
          courierId: mockCourierUser.id,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.COURIER_UNAVAILABLE,
          status: HttpStatus.BAD_REQUEST,
        }),
      );
    });

    it('rejects assignment with COURIER_UNAVAILABLE if courier is marked unavailable', async () => {
      prismaMock.parcel.findUnique.mockResolvedValue(mockParcel);
      prismaMock.courierAssignment.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockCourierUser,
        courierProfile: {
          ...mockCourierUser.courierProfile,
          isAvailable: false,
        },
      });

      await expect(
        service.assign(mockDispatcher, {
          parcelId: mockParcel.id,
          courierId: mockCourierUser.id,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.COURIER_UNAVAILABLE,
          status: HttpStatus.BAD_REQUEST,
        }),
      );
    });

    it('rejects assignment if parcel status is not CREATED or FAILED', async () => {
      prismaMock.parcel.findUnique.mockResolvedValue({
        ...mockParcel,
        status: 'DELIVERED',
      });

      await expect(
        service.assign(mockDispatcher, {
          parcelId: mockParcel.id,
          courierId: mockCourierUser.id,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_STATUS_TRANSITION,
          status: HttpStatus.BAD_REQUEST,
        }),
      );
    });
  });

  describe('Courier Unassignment', () => {
    it('cancels active assignment when parcel is in CREATED status', async () => {
      prismaMock.courierAssignment.findUnique.mockResolvedValue({
        id: 'assign-1',
        parcelId: mockParcel.id,
        courierId: mockCourierUser.id,
        status: 'ACTIVE',
        parcel: { id: mockParcel.id, status: 'CREATED', trackingNumber: mockParcel.trackingNumber },
      });

      const res = await service.unassign(mockDispatcher, 'assign-1');
      expect(res.success).toBe(true);
      expect(prismaMock.courierAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assign-1' },
        data: { status: 'CANCELLED' },
      });
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'parcel.unassigned',
          entityType: 'parcel',
          entityId: mockParcel.id,
        }),
        prismaMock,
      );
    });

    it('cancels active assignment when parcel is in PICKED_UP status', async () => {
      prismaMock.courierAssignment.findUnique.mockResolvedValue({
        id: 'assign-1',
        parcelId: mockParcel.id,
        courierId: mockCourierUser.id,
        status: 'ACTIVE',
        parcel: {
          id: mockParcel.id,
          status: 'PICKED_UP',
          trackingNumber: mockParcel.trackingNumber,
        },
      });

      const res = await service.unassign(mockDispatcher, 'assign-1');
      expect(res.success).toBe(true);
    });

    it('rejects unassign if parcel has advanced past pickup stage (e.g. IN_TRANSIT)', async () => {
      prismaMock.courierAssignment.findUnique.mockResolvedValue({
        id: 'assign-1',
        parcelId: mockParcel.id,
        courierId: mockCourierUser.id,
        status: 'ACTIVE',
        parcel: {
          id: mockParcel.id,
          status: 'IN_TRANSIT',
          trackingNumber: mockParcel.trackingNumber,
        },
      });

      await expect(service.unassign(mockDispatcher, 'assign-1')).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.INVALID_STATUS_TRANSITION,
          status: HttpStatus.BAD_REQUEST,
        }),
      );
    });

    it('rejects unassign if assignment is not ACTIVE', async () => {
      prismaMock.courierAssignment.findUnique.mockResolvedValue({
        id: 'assign-1',
        parcelId: mockParcel.id,
        courierId: mockCourierUser.id,
        status: 'COMPLETED',
        parcel: { id: mockParcel.id, status: 'CREATED', trackingNumber: mockParcel.trackingNumber },
      });

      await expect(service.unassign(mockDispatcher, 'assign-1')).rejects.toThrow(
        expect.objectContaining({
          code: ERROR_CODES.CONFLICT,
          status: HttpStatus.CONFLICT,
        }),
      );
    });
  });

  describe('Workload & Completion', () => {
    it('completeAssignment updates active assignment to COMPLETED with timestamp', async () => {
      await service.completeAssignment(mockParcel.id);
      expect(prismaMock.courierAssignment.updateMany).toHaveBeenCalledWith({
        where: { parcelId: mockParcel.id, status: 'ACTIVE' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        }),
      });
    });

    it('courierWorkload returns active deliveries count and capacity limits', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'c-1',
          name: 'Chamal Courier',
          email: 'courier1@swiftdrop.test',
          courierProfile: {
            zoneId: 'zone-cmb',
            zone: { name: 'Colombo' },
            isAvailable: true,
            maxActiveParcels: 15,
          },
          courierAssignments: [{ id: 'a-1' }, { id: 'a-2' }],
        },
      ]);

      const workload = await service.courierWorkload();
      expect(workload).toHaveLength(1);
      expect(workload[0].courierId).toBe('c-1');
      expect(workload[0].activeParcels).toBe(2);
      expect(workload[0].maxActiveParcels).toBe(15);
      expect(workload[0].isAvailable).toBe(true);
      expect(workload[0].zoneName).toBe('Colombo');
    });
  });
});
