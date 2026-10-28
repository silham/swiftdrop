import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQuery } from '../../common/pagination/pagination';

export const ATTEMPT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'DEAD'] as const;

export class ListAttemptsQuery extends PaginationQuery {
  @ApiPropertyOptional({ enum: ATTEMPT_STATUSES })
  @IsOptional()
  @IsIn(ATTEMPT_STATUSES)
  status?: (typeof ATTEMPT_STATUSES)[number];
}

export class OutboxStatsDto {
  @ApiProperty({ description: 'Outbox rows not yet published to RabbitMQ' })
  pending!: number;

  @ApiProperty({ description: 'Pending rows whose last publish attempt failed' })
  failing!: number;
}

export class QueueDepthDto {
  @ApiProperty({ example: 'webhooks.parcel-events.dlq' }) name!: string;
  @ApiProperty({ enum: ['work', 'dlq'] }) kind!: 'work' | 'dlq';
  @ApiProperty({ nullable: true, type: Number, description: 'null when the queue is unavailable' })
  messages!: number | null;
  @ApiProperty({ nullable: true, type: Number }) consumers!: number | null;
}

export class WebhookAttemptDto {
  @ApiProperty() id!: string;
  @ApiProperty() endpointId!: string;
  @ApiProperty({ description: 'Merchant endpoint URL (no secret)' }) endpointUrl!: string;
  @ApiProperty({ description: 'Id of the domain event that was delivered' }) eventId!: string;
  @ApiProperty() attemptNumber!: number;
  @ApiProperty({ enum: ATTEMPT_STATUSES }) status!: (typeof ATTEMPT_STATUSES)[number];
  @ApiPropertyOptional({ nullable: true, type: Number }) responseStatus!: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) errorMessage!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) durationMs!: number | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  nextRetryAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class WebhookAttemptPageMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

export class WebhookAttemptPageDto {
  @ApiProperty({ type: [WebhookAttemptDto] }) data!: WebhookAttemptDto[];
  @ApiProperty({ type: WebhookAttemptPageMetaDto }) meta!: WebhookAttemptPageMetaDto;
}

export class RetryQueuedDto {
  @ApiProperty({ example: true }) queued!: boolean;
}
