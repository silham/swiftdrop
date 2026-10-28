import { Injectable } from '@nestjs/common';
import type { Paginated } from '@swiftdrop/contracts';
import type { Parcel, ParcelSize, ParcelStatus } from '@swiftdrop/db';
import { notFound } from '../../common/errors/app-error';
import { PaginationQuery, paginated } from '../../common/pagination/pagination';
import { PrismaService } from '../../infra/prisma';
import { ParcelsService, type ParcelDto } from '../parcels';
import type { MerchantCreateParcelDto } from './dto/merchant-api.dto';

export interface CreateParcelResult {
  parcel: ParcelDto;
  isExisting: boolean;
}

/** Partner API — every query scoped by the merchantId resolved from the API key. Owner: M5. */
@Injectable()
export class MerchantApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parcels: ParcelsService,
  ) {}

  private toParcelDto(parcel: Parcel): ParcelDto {
    return {
      id: parcel.id,
      trackingNumber: parcel.trackingNumber,
      status: parcel.status as ParcelStatus,
      senderName: parcel.senderName,
      pickupAddress: parcel.pickupAddress,
      pickupCity: parcel.pickupCity,
      recipientName: parcel.recipientName,
      dropoffAddress: parcel.dropoffAddress,
      dropoffCity: parcel.dropoffCity,
      size: parcel.size as ParcelSize,
      weightKg: Number(parcel.weightKg),
      feeCents: parcel.feeCents,
      currency: parcel.currency,
      createdAt: parcel.createdAt,
      deliveredAt: parcel.deliveredAt,
    };
  }

  async createParcel(
    merchantId: string,
    dto: MerchantCreateParcelDto,
  ): Promise<CreateParcelResult> {
    // 1. Idempotency check: if (merchantId, merchantReference) exists, return it (200)
    const existing = await this.prisma.parcel.findUnique({
      where: {
        merchantId_merchantReference: {
          merchantId,
          merchantReference: dto.merchantReference,
        },
      },
    });

    if (existing) {
      return { parcel: this.toParcelDto(existing), isExisting: true };
    }

    // 2. Otherwise call parcels.create with source 'MERCHANT_API' (201)
    try {
      const created = await this.parcels.create(
        {
          ...dto,
          source: 'MERCHANT_API',
          merchantId,
          merchantReference: dto.merchantReference,
        },
        'MERCHANT',
      );
      return { parcel: this.toParcelDto(created), isExisting: false };
    } catch (err: any) {
      // Handle race condition on unique constraint [merchantId, merchantReference]
      if (err.code === 'P2002' || err.message?.includes('Unique constraint failed')) {
        const raceExisting = await this.prisma.parcel.findUnique({
          where: {
            merchantId_merchantReference: {
              merchantId,
              merchantReference: dto.merchantReference,
            },
          },
        });
        if (raceExisting) {
          return { parcel: this.toParcelDto(raceExisting), isExisting: true };
        }
      }
      throw err;
    }
  }

  async listParcels(merchantId: string, q: PaginationQuery): Promise<Paginated<ParcelDto>> {
    const where = { merchantId };
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
      parcels.map((p) => this.toParcelDto(p)),
      total,
      q,
    );
  }

  async getParcel(merchantId: string, trackingNumber: string): Promise<ParcelDto> {
    const parcel = await this.prisma.parcel.findUnique({
      where: { trackingNumber },
    });

    if (!parcel || parcel.merchantId !== merchantId) {
      throw notFound('Parcel');
    }

    return this.toParcelDto(parcel);
  }
}
