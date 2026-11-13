import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES, MAX_DELIVERY_ATTEMPTS, type ParcelStatus } from '@swiftdrop/contracts';
import type { CourierAssignment, Parcel } from '@swiftdrop/db';
import type { Readable } from 'node:stream';
import type { AuthUser } from '../../common/auth';
import { AppError, notFound } from '../../common/errors/app-error';
import { paginated } from '../../common/pagination/pagination';
import { InjectConfig, type Env } from '../../config/config.module';
import { PrismaService } from '../../infra/prisma';
import { StorageService } from '../../infra/storage';
import { DispatchService } from '../dispatch';
import { ParcelsService } from '../parcels';
import { nextCourierActions } from './courier-actions';
import type {
  CourierHistoryPageDto,
  CourierParcelDetailDto,
  CourierParcelDto,
  CourierStatusUpdateDto,
  ListCourierHistoryQuery,
  ProofOfDeliveryDto,
} from './dto/courier.dto';
import { detectImageType, mimeForKey } from './file-type';

/**
 * Courier workflow. EVERY action first checks DispatchService.getActiveAssignment(parcelId)
 * belongs to `user.id` (else 404). Status changes go through ParcelsService.transition. Owner: M6.
 */
@Injectable()
export class CourierService {
  private readonly logger = new Logger(CourierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parcels: ParcelsService,
    private readonly dispatch: DispatchService,
    private readonly storage: StorageService,
    @InjectConfig() private readonly config: Env,
  ) {}

  async listAssigned(user: AuthUser): Promise<CourierParcelDto[]> {
    const assignments = await this.prisma.courierAssignment.findMany({
      where: { courierId: user.id, status: 'ACTIVE' },
      include: { parcel: true },
      orderBy: { assignedAt: 'asc' },
    });
    return assignments.map((a) => toCourierParcel(a.parcel, a));
  }

  /** My active parcel, or one I finished (delivered / failed for good), so history stays viewable. */
  async getAssigned(user: AuthUser, parcelId: string): Promise<CourierParcelDetailDto> {
    const active = await this.dispatch.getActiveAssignment(parcelId);
    if (active) {
      if (active.courierId !== user.id) throw notFound('Parcel');
      return this.detail(parcelId, active);
    }
    const finished = await this.prisma.courierAssignment.findFirst({
      where: { parcelId, courierId: user.id, status: 'COMPLETED' },
      orderBy: { assignedAt: 'desc' },
    });
    if (!finished) throw notFound('Parcel');
    return this.detail(parcelId, finished);
  }

  /**
   * FAILED keeps the assignment so the same courier can re-attempt. When the last allowed attempt
   * fails, the assignment is completed in the same transaction (workload drops, it moves to history).
   */
  async updateStatus(
    user: AuthUser,
    parcelId: string,
    dto: CourierStatusUpdateDto,
  ): Promise<CourierParcelDetailDto> {
    await this.requireMyAssignment(user, parcelId);
    await this.prisma.$transaction(async (tx) => {
      const parcel = await this.parcels.transition(parcelId, {
        to: dto.status,
        actor: { id: user.id, role: user.role },
        failureReason: dto.failureReason,
        note: dto.note,
        tx,
      });
      if (parcel.status === 'FAILED' && parcel.deliveryAttempts >= MAX_DELIVERY_ATTEMPTS) {
        await this.dispatch.completeAssignment(parcelId, tx);
      }
    });
    // After a final failure the assignment is closed, so read the latest one, not the active one.
    return this.detail(parcelId, await this.lastAssignment(user, parcelId));
  }

  /**
   * Validate the photo (size, magic bytes) → store it → in ONE transaction: ProofOfDelivery +
   * transition DELIVERED + complete the assignment. If the transaction fails, delete the object.
   */
  async submitProof(
    user: AuthUser,
    parcelId: string,
    dto: ProofOfDeliveryDto,
    photo?: Express.Multer.File,
  ): Promise<CourierParcelDetailDto> {
    await this.requireMyAssignment(user, parcelId);

    // Check the status first, so we never store a file for a transition that can't happen.
    const parcel = await this.prisma.parcel.findUniqueOrThrow({ where: { id: parcelId } });
    if (parcel.status !== 'OUT_FOR_DELIVERY') {
      throw new AppError(
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        `Cannot deliver a parcel in status ${parcel.status}. Mark it out for delivery first.`,
        HttpStatus.CONFLICT,
        { from: parcel.status, to: 'DELIVERED' },
      );
    }

    if (!photo || !photo.buffer?.length) {
      throw new AppError(
        ERROR_CODES.PROOF_REQUIRED,
        'A photo is required as proof of delivery',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (photo.size > this.config.UPLOAD_MAX_BYTES) {
      throw new AppError(
        ERROR_CODES.FILE_TOO_LARGE,
        `The photo is too large (max ${Math.floor(this.config.UPLOAD_MAX_BYTES / (1024 * 1024))} MB)`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    const type = detectImageType(photo.buffer);
    if (!type) {
      throw new AppError(
        ERROR_CODES.UNSUPPORTED_FILE,
        'The photo must be a JPEG, PNG or WebP image',
        HttpStatus.BAD_REQUEST,
      );
    }

    const key = `pod/${parcelId}/${randomUUID()}.${type.ext}`;
    await this.storage.put(key, photo.buffer, type.mime);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.proofOfDelivery.create({
          data: {
            parcelId,
            courierId: user.id,
            recipientName: dto.recipientName,
            notes: dto.notes ?? null,
            photoKey: key,
          },
        });
        await this.parcels.transition(parcelId, {
          to: 'DELIVERED',
          actor: { id: user.id, role: user.role },
          tx,
        });
        await this.dispatch.completeAssignment(parcelId, tx);
      });
    } catch (err) {
      await this.storage.remove(key).catch((removeErr: unknown) => {
        this.logger.warn(
          `Could not remove orphaned proof object for parcel ${parcelId}: ${(removeErr as Error).message}`,
        );
      });
      throw err;
    }

    return this.detail(parcelId, await this.lastAssignment(user, parcelId));
  }

  /**
   * Stream the proof photo. Allowed: ADMIN, DISPATCHER, the courier who captured it, and the
   * customer who owns the parcel. Everyone else gets 404, as if there were no photo.
   */
  async proofPhoto(
    user: AuthUser,
    parcelId: string,
  ): Promise<{ stream: Readable; contentType: string }> {
    const proof = await this.prisma.proofOfDelivery.findUnique({
      where: { parcelId },
      include: { parcel: { select: { customerId: true } } },
    });
    if (!proof?.photoKey) throw notFound('Proof photo');

    const allowed =
      user.role === 'ADMIN' ||
      user.role === 'DISPATCHER' ||
      (user.role === 'COURIER' && proof.courierId === user.id) ||
      (user.role === 'CUSTOMER' && proof.parcel.customerId === user.id);
    if (!allowed) throw notFound('Proof photo');

    const stream = await this.storage.get(proof.photoKey);
    return { stream, contentType: mimeForKey(proof.photoKey) };
  }

  async history(user: AuthUser, q: ListCourierHistoryQuery): Promise<CourierHistoryPageDto> {
    const where = { courierId: user.id, status: 'COMPLETED' as const };
    const [rows, total] = await Promise.all([
      this.prisma.courierAssignment.findMany({
        where,
        include: { parcel: true },
        orderBy: { completedAt: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.courierAssignment.count({ where }),
    ]);
    return paginated(
      rows.map((a) => ({
        assignmentId: a.id,
        parcelId: a.parcelId,
        trackingNumber: a.parcel.trackingNumber,
        status: a.parcel.status as ParcelStatus,
        recipientName: a.parcel.recipientName,
        dropoffAddress: a.parcel.dropoffAddress,
        dropoffCity: a.parcel.dropoffCity,
        assignedAt: a.assignedAt,
        completedAt: a.completedAt,
        deliveredAt: a.parcel.deliveredAt,
      })),
      total,
      q,
    );
  }

  private async detail(
    parcelId: string,
    assignment: CourierAssignment,
  ): Promise<CourierParcelDetailDto> {
    const [parcel, history] = await Promise.all([
      this.prisma.parcel.findUniqueOrThrow({ where: { id: parcelId } }),
      this.parcels.getHistory(parcelId),
    ]);
    return {
      ...toCourierParcel(parcel, assignment),
      history: history.map((h) => ({
        status: h.toStatus,
        fromStatus: h.fromStatus,
        at: h.createdAt,
        reason: h.reason,
        note: h.note,
      })),
    };
  }

  /** My most recent assignment for a parcel, including a just-completed one. */
  private lastAssignment(user: AuthUser, parcelId: string): Promise<CourierAssignment> {
    return this.prisma.courierAssignment.findFirstOrThrow({
      where: { parcelId, courierId: user.id },
      orderBy: { assignedAt: 'desc' },
    });
  }

  /** 404 unless the parcel has an ACTIVE assignment to this courier. */
  private async requireMyAssignment(user: AuthUser, parcelId: string): Promise<CourierAssignment> {
    const assignment = await this.dispatch.getActiveAssignment(parcelId);
    if (!assignment || assignment.courierId !== user.id) throw notFound('Parcel');
    return assignment;
  }
}

function toCourierParcel(parcel: Parcel, assignment: CourierAssignment): CourierParcelDto {
  const { statuses, canDeliver } = nextCourierActions(parcel.status, parcel.deliveryAttempts);
  const active = assignment.status === 'ACTIVE';
  return {
    id: parcel.id,
    trackingNumber: parcel.trackingNumber,
    status: parcel.status,
    senderName: parcel.senderName,
    senderPhone: parcel.senderPhone,
    pickupAddress: parcel.pickupAddress,
    pickupCity: parcel.pickupCity,
    recipientName: parcel.recipientName,
    recipientPhone: parcel.recipientPhone,
    dropoffAddress: parcel.dropoffAddress,
    dropoffCity: parcel.dropoffCity,
    size: parcel.size,
    weightKg: Number(parcel.weightKg),
    description: parcel.description,
    deliveryAttempts: parcel.deliveryAttempts,
    assignedAt: assignment.assignedAt,
    // A closed assignment has nothing left to do.
    nextStatuses: active ? statuses : [],
    canDeliver: active && canDeliver,
  };
}
