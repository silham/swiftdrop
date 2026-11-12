import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';
import { Roles } from '../../common/auth';
import { PaginationQuery } from '../../common/pagination/pagination';
import { AuditService } from './audit.service';

export class AuditUserLookupDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
}

export class AuditPageMetaDto {
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
  @ApiProperty() total: number;
}

export class AuditActorDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty() role: string;
}

export class AuditPersonDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
}

/** One audit entry. Metadata never carries secrets (the service strips sensitive keys). */
export class AuditLogEntryDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'parcel.assigned' }) action: string;
  @ApiProperty() entityType: string;
  @ApiProperty() entityId: string;
  @ApiPropertyOptional({ type: AuditActorDto, nullable: true }) actor: AuditActorDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actorRole: string | null;
  @ApiPropertyOptional({ type: AuditPersonDto, nullable: true })
  affectedPerson: AuditPersonDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) timestamp: Date;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  metadata: Record<string, unknown> | null;
}

export class AuditLogPageDto {
  @ApiProperty({ type: [AuditLogEntryDto] }) data: AuditLogEntryDto[];
  @ApiProperty({ type: AuditPageMetaDto }) meta: AuditPageMetaDto;
}

export class AuditUserLookupPageDto {
  @ApiProperty({ type: [AuditUserLookupDto] }) data: AuditUserLookupDto[];
  @ApiProperty({ type: AuditPageMetaDto }) meta: AuditPageMetaDto;
}

export class ListAuditUsersQuery extends PaginationQuery {
  // Required, and trimmed first so an all-blank search doesn't match every user.
  @ApiProperty({ minLength: 1 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  search!: string;
}

export class ListAuditLogsQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}

/** Owner: M9 */
@ApiTags('audit')
@Controller('admin/audit-logs')
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOkResponse({ type: AuditLogPageDto })
  list(@Query() q: ListAuditLogsQuery) {
    return this.audit.list(q);
  }

  @Get('users')
  @ApiOkResponse({ type: AuditUserLookupPageDto })
  users(@Query() q: ListAuditUsersQuery) {
    return this.audit.listUsers(q);
  }
}
