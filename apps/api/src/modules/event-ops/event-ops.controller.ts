import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import {
  ListAttemptsQuery,
  OutboxStatsDto,
  QueueDepthDto,
  RetryQueuedDto,
  WebhookAttemptPageDto,
} from './event-ops.dto';
import { EventOpsService } from './event-ops.service';

/** Owner: M8 — operator visibility into the event pipeline (outbox backlog, dead-lettered webhooks). */
@ApiTags('event-ops')
@Controller('admin/ops')
@Roles('ADMIN')
export class EventOpsController {
  constructor(private readonly ops: EventOpsService) {}

  @Get('outbox')
  @ApiOperation({ summary: 'Outbox backlog: rows not yet published to RabbitMQ' })
  @ApiOkResponse({ type: OutboxStatsDto })
  outbox() {
    return this.ops.outboxStats();
  }

  @Get('queues')
  @ApiOperation({ summary: 'Depth of the work queues and their dead-letter queues' })
  @ApiOkResponse({ type: [QueueDepthDto] })
  queues() {
    return this.ops.queueDepths();
  }

  @Get('webhook-attempts')
  @ApiOperation({
    summary: 'Webhook delivery attempts, newest first (filter by status, e.g. DEAD)',
  })
  @ApiOkResponse({ type: WebhookAttemptPageDto })
  attempts(@Query() q: ListAttemptsQuery) {
    return this.ops.listAttempts(q);
  }

  @Post('webhook-attempts/:id/retry')
  @HttpCode(202)
  @ApiOperation({ summary: 'Re-deliver the event of a FAILED/DEAD attempt to its endpoint' })
  @ApiAcceptedResponse({ type: RetryQueuedDto })
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ops.retryAttempt(user, id);
  }
}
