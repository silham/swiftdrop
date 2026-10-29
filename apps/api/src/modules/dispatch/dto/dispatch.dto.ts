import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ nullable: true }) email?: string;
  @ApiPropertyOptional({ nullable: true }) zoneId: string | null;
  @ApiPropertyOptional({ nullable: true }) zoneName?: string | null;
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
  @ApiProperty() status: string;
  @ApiPropertyOptional({ nullable: true }) pickupZoneId: string | null;
  @ApiPropertyOptional({ nullable: true }) pickupZoneName?: string | null;
  @ApiProperty() pickupCity: string;
  @ApiProperty() dropoffCity: string;
  @ApiProperty() size: string;
  @ApiProperty() weightKg: number;
  @ApiProperty() feeCents: number;
  @ApiProperty() currency: string;
  @ApiProperty() createdAt: Date;
}
