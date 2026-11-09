import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FAILURE_REASONS,
  PARCEL_SIZES,
  PARCEL_STATUSES,
  type FailureReason,
  type ParcelSize,
  type ParcelStatus,
} from '@swiftdrop/contracts';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination';

/** Couriers may only request these statuses; the graph itself is validated by ParcelsService. */
export const COURIER_SETTABLE = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED'] as const;

export class CourierStatusUpdateDto {
  @ApiProperty({ enum: COURIER_SETTABLE, description: 'DELIVERED is set via POST /proof' })
  @IsIn(COURIER_SETTABLE)
  status: (typeof COURIER_SETTABLE)[number];

  @ApiPropertyOptional({ enum: FAILURE_REASONS, description: 'required when status=FAILED' })
  @IsOptional()
  @IsIn(FAILURE_REASONS)
  failureReason?: FailureReason;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** multipart/form-data: fields below + `photo` file (jpeg/png/webp, ≤ UPLOAD_MAX_BYTES). */
export class ProofOfDeliveryDto {
  @ApiProperty() @IsString() @Length(2, 100) recipientName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ListCourierHistoryQuery extends PaginationQuery {}

/** What the courier sees for an assigned parcel. Contact details are needed to deliver it. */
export class CourierParcelDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'SD123456789' }) trackingNumber: string;
  @ApiProperty({ enum: PARCEL_STATUSES }) status: ParcelStatus;
  @ApiProperty() senderName: string;
  @ApiProperty() senderPhone: string;
  @ApiProperty() pickupAddress: string;
  @ApiProperty() pickupCity: string;
  @ApiProperty() recipientName: string;
  @ApiProperty() recipientPhone: string;
  @ApiProperty() dropoffAddress: string;
  @ApiProperty() dropoffCity: string;
  @ApiProperty({ enum: PARCEL_SIZES }) size: ParcelSize;
  @ApiProperty() weightKg: number;
  @ApiPropertyOptional({ nullable: true, type: String }) description: string | null;
  @ApiProperty() deliveryAttempts: number;
  @ApiProperty() assignedAt: Date;
  @ApiProperty({ enum: COURIER_SETTABLE, isArray: true, description: 'statuses I may set next' })
  nextStatuses: (typeof COURIER_SETTABLE)[number][];
  @ApiProperty({ description: 'true when proof of delivery can be submitted' })
  canDeliver: boolean;
}

export class CourierHistoryEntryDto {
  @ApiProperty({ enum: PARCEL_STATUSES }) status: ParcelStatus;
  @ApiPropertyOptional({ enum: PARCEL_STATUSES, nullable: true }) fromStatus: ParcelStatus | null;
  @ApiProperty() at: Date;
  @ApiPropertyOptional({ nullable: true, type: String }) reason: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) note: string | null;
}

export class CourierParcelDetailDto extends CourierParcelDto {
  @ApiProperty({ type: [CourierHistoryEntryDto] }) history: CourierHistoryEntryDto[];
}

/** One finished assignment (DELIVERED, or FAILED on the last allowed attempt). */
export class CourierHistoryItemDto {
  @ApiProperty() assignmentId: string;
  @ApiProperty() parcelId: string;
  @ApiProperty() trackingNumber: string;
  @ApiProperty({ enum: PARCEL_STATUSES }) status: ParcelStatus;
  @ApiProperty() recipientName: string;
  @ApiProperty() dropoffAddress: string;
  @ApiProperty() dropoffCity: string;
  @ApiProperty() assignedAt: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deliveredAt: Date | null;
}

class CourierHistoryPageMetaDto {
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
  @ApiProperty() total: number;
}

export class CourierHistoryPageDto {
  @ApiProperty({ type: [CourierHistoryItemDto] }) data: CourierHistoryItemDto[];
  @ApiProperty({ type: CourierHistoryPageMetaDto }) meta: CourierHistoryPageMetaDto;
}
