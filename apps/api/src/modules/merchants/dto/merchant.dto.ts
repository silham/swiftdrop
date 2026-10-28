import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination';

export const MERCHANT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;

/** Public sign-up: creates a MERCHANT user + a PENDING merchant. */
export class RegisterMerchantDto {
  @ApiProperty() @IsString() @Length(2, 120) businessName: string;
  @ApiProperty() @IsString() @Length(2, 100) contactName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) @MaxLength(128) password: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPhone?: string;
}

export class MerchantDto {
  @ApiProperty() id: string;
  @ApiProperty() businessName: string;
  @ApiProperty() contactEmail: string;
  @ApiPropertyOptional({ nullable: true }) contactPhone?: string | null;
  @ApiProperty({ enum: MERCHANT_STATUSES }) status: string;
  @ApiPropertyOptional({ nullable: true }) approvedAt?: Date | null;
  @ApiPropertyOptional({ nullable: true }) approvedById?: string | null;
  @ApiProperty() createdAt: Date;
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production shop' }) @IsString() @Length(2, 60) name: string;
}

export class ApiKeyDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: 'sd_live_ab12cd34' }) prefix: string;
  @ApiPropertyOptional({ nullable: true }) lastUsedAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) revokedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

/** Returned ONCE at creation. The raw key is never retrievable again. */
export class CreatedApiKeyDto extends ApiKeyDto {
  @ApiProperty() key: string;
}

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://shop.example.com/hooks/swiftdrop' })
  @IsUrl({ protocols: ['https', 'http'], require_tld: false })
  url: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTypes?: string[];
}

export class UpdateWebhookDto {
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) url?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class WebhookDto {
  @ApiProperty() id: string;
  @ApiProperty() url: string;
  @ApiProperty({ type: [String] }) eventTypes: string[];
  @ApiProperty() isActive: boolean;
  @ApiProperty() createdAt: Date;
}

/** Signing secret is returned ONCE on create / rotate. */
export class WebhookWithSecretDto extends WebhookDto {
  @ApiProperty() secret: string;
}

export class ListMerchantsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: MERCHANT_STATUSES })
  @IsOptional()
  @IsIn(MERCHANT_STATUSES)
  status?: string;
}

export class RejectMerchantDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
