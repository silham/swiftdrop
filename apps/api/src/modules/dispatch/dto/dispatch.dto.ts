import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PARCEL_SIZES,
  PARCEL_STATUSES,
  type ParcelSize,
  type ParcelStatus,
} from '@swiftdrop/contracts';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination';

export class CreateAssignmentDto {
  @ApiProperty() @IsString() parcelId: string;
  @ApiProperty() @IsString() courierId: string;
}

export class ListUnassignedQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
}

export class CourierWorkloadDto {
  @ApiProperty() courierId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() email?: string;
  @ApiProperty({ type: String, nullable: true }) zoneId: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) zoneName?: string | null;
  @ApiProperty() isAvailable: boolean;
  @ApiProperty() activeParcels: number;
  @ApiProperty() maxActiveParcels: number;
}

export class AssignmentDto {
  @ApiProperty() id: string;
  @ApiProperty() parcelId: string;
  @ApiProperty() courierId: string;
  @ApiProperty() status: string;
  @ApiProperty() assignedAt: Date;
}

export class UnassignedParcelDto {
  @ApiProperty() id: string;
  @ApiProperty() trackingNumber: string;
  @ApiProperty({ enum: PARCEL_STATUSES }) status: ParcelStatus;
  @ApiProperty({ type: String, nullable: true }) pickupZoneId: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) pickupZoneName?: string | null;
  @ApiProperty() pickupCity: string;
  @ApiProperty() dropoffCity: string;
  @ApiProperty({ enum: PARCEL_SIZES }) size: ParcelSize;
  @ApiProperty() weightKg: number;
  @ApiProperty() feeCents: number;
  @ApiProperty() currency: string;
  @ApiProperty() createdAt: Date;
}

export class UnassignedPageMetaDto {
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
  @ApiProperty() total: number;
}

export class UnassignedParcelPageDto {
  @ApiProperty({ type: [UnassignedParcelDto] }) data: UnassignedParcelDto[];
  @ApiProperty({ type: UnassignedPageMetaDto }) meta: UnassignedPageMetaDto;
}
