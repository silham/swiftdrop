import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PARCEL_SIZES, type ParcelSize } from '@swiftdrop/contracts';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class EstimateRequestDto {
  @ApiProperty({ example: 'colombo' }) @IsString() @Length(2, 80) pickupCity: string;
  @ApiProperty({ example: 'kandy' }) @IsString() @Length(2, 80) dropoffCity: string;
  @ApiProperty({ enum: PARCEL_SIZES }) @IsIn(PARCEL_SIZES) size: ParcelSize;
  @ApiProperty({ example: 1.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  weightKg: number;
}

export class EstimateResponseDto {
  @ApiProperty({ example: 52500, description: 'minor units (cents)' }) feeCents: number;
  @ApiProperty({ example: 'LKR' }) currency: string;
  @ApiProperty() pickupZoneId: string;
  @ApiProperty() dropoffZoneId: string;
  @ApiProperty() ruleId: string;
  @ApiProperty({ example: 'Island-wide default' }) ruleName: string;
}

export class ZoneDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: [String] }) cities: string[];
  @ApiProperty() isActive: boolean;
  @ApiPropertyOptional() createdAt?: Date;
  @ApiPropertyOptional() updatedAt?: Date;
}

export class CreateZoneDto {
  @ApiProperty({ example: 'CMB' }) @IsString() @Length(2, 10) code: string;
  @ApiProperty({ example: 'Colombo' }) @IsString() @Length(2, 80) name: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  cities: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateZoneDto extends PartialType(CreateZoneDto) {}

export class PricingRuleDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) fromZoneId: string | null;
  @ApiPropertyOptional({ nullable: true }) toZoneId: string | null;
  @ApiPropertyOptional({ nullable: true }) fromZoneName?: string | null;
  @ApiPropertyOptional({ nullable: true }) toZoneName?: string | null;
  @ApiPropertyOptional({ enum: PARCEL_SIZES, nullable: true }) size: ParcelSize | null;
  @ApiProperty() baseFeeCents: number;
  @ApiProperty() perKgCents: number;
  @ApiProperty() priority: number;
  @ApiProperty() isActive: boolean;
  @ApiPropertyOptional({ nullable: true }) validFrom?: Date | null;
  @ApiPropertyOptional({ nullable: true }) validTo?: Date | null;
  @ApiPropertyOptional() createdAt?: Date;
  @ApiPropertyOptional() updatedAt?: Date;
}

export class CreatePricingRuleDto {
  @ApiProperty() @IsString() @Length(2, 80) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fromZoneId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() toZoneId?: string;
  @ApiPropertyOptional({ enum: PARCEL_SIZES }) @IsOptional() @IsIn(PARCEL_SIZES) size?: ParcelSize;
  @ApiProperty() @IsInt() @Min(0) baseFeeCents: number;
  @ApiProperty() @IsInt() @Min(0) perKgCents: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() validTo?: string;
}
export class UpdatePricingRuleDto extends PartialType(CreatePricingRuleDto) {}
