import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, QUEUES } from '@swiftdrop/contracts';
import type { Prisma } from '@swiftdrop/db';
import type { AuthUser } from '../../common/auth';
import { AppError, notFound } from '../../common/errors/app-error';
import { paginated } from '../../common/pagination/pagination';
import { RabbitMqService } from '../../infra/events';
import { PrismaService } from '../../infra/prisma';
import { AuditService } from '../audit';
import type { ListAttemptsQuery, QueueDepthDto, WebhookAttemptDto } from './event-ops.dto';

/** Header understood by the worker's webhooks consumer: deliver to this endpoint only. */
const TARGET_ENDPOINT_HEADER = 'x-target-endpoint';

/** Owner: M8. Operator visibility into the event pipeline (ADMIN only, see the controller). */
@Injectable()
export class EventOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    private readonly audit: AuditService,
  ) {}

  async outboxStats() {
    const [pending, failing] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { publishedAt: null } }),
      this.prisma.outboxEvent.count({ where: { publishedAt: null, attempts: { gt: 0 } } }),
    ]);
    return { pending, failing };
  }

  /** Depth of the work queues and their dead-letter queues (a non-empty DLQ needs attention). */
  async queueDepths(): Promise<QueueDepthDto[]> {
    const out: QueueDepthDto[] = [];
    // One at a time: a missing queue closes the inspection channel, so calls must not overlap.
    for (const work of [QUEUES.NOTIFICATIONS, QUEUES.WEBHOOKS]) {
      for (const [name, kind] of [
        [work, 'work'],
        [`${work}.dlq`, 'dlq'],
      ] as const) {
        const depth = await this.rabbit.queueDepth(name);
        out.push({
          name,
          kind,
          messages: depth?.messages ?? null,
          consumers: depth?.consumers ?? null,
        });
      }
    }
    return out;
  }

  async listAttempts(q: ListAttemptsQuery) {
    const where: Prisma.WebhookAttemptWhereInput = q.status ? { status: q.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.webhookAttempt.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: q.skip,
        take: q.take,
        include: { endpoint: { select: { url: true } } },
      }),
      this.prisma.webhookAttempt.count({ where }),
    ]);
    const data: WebhookAttemptDto[] = rows.map((a) => ({
      id: a.id,
      endpointId: a.endpointId,
      endpointUrl: a.endpoint.url,
      eventId: a.eventId,
      attemptNumber: a.attemptNumber,
      status: a.status,
      responseStatus: a.responseStatus,
      errorMessage: a.errorMessage,
      durationMs: a.durationMs,
      nextRetryAt: a.nextRetryAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    }));
    return paginated(data, total, q);
  }

  /**
   * Re-queue the event of a FAILED/DEAD attempt for that one endpoint: the original envelope is
   * read back from the outbox and published to the webhooks queue with a target-endpoint header.
   */
  async retryAttempt(actor: AuthUser, id: string) {
    const attempt = await this.prisma.webhookAttempt.findUnique({ where: { id } });
    if (!attempt) throw notFound('Webhook attempt');
    if (attempt.status !== 'DEAD' && attempt.status !== 'FAILED') {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'Only FAILED or DEAD attempts can be retried',
        HttpStatus.CONFLICT,
      );
    }
    const delivered = await this.prisma.webhookAttempt.count({
      where: { endpointId: attempt.endpointId, eventId: attempt.eventId, status: 'SUCCEEDED' },
    });
    if (delivered > 0) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'This event was already delivered to the endpoint',
        HttpStatus.CONFLICT,
      );
    }
    // Only the newest attempt for this endpoint + event can be retried, and not while the worker
    // still has an automatic retry scheduled; otherwise the merchant would receive it twice.
    const latest = await this.prisma.webhookAttempt.findFirst({
      where: { endpointId: attempt.endpointId, eventId: attempt.eventId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (latest && latest.id !== attempt.id) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'A newer attempt exists for this event and endpoint; retry that one instead',
        HttpStatus.CONFLICT,
      );
    }
    if (attempt.status === 'FAILED' && attempt.nextRetryAt && attempt.nextRetryAt > new Date()) {
      throw new AppError(
        ERROR_CODES.CONFLICT,
        'An automatic retry is already scheduled for this attempt',
        HttpStatus.CONFLICT,
      );
    }
    const event = await this.prisma.outboxEvent.findUnique({ where: { id: attempt.eventId } });
    if (!event) throw notFound('Event');
    // The default exchange drops messages for a missing queue, so make sure it exists first.
    if (!this.rabbit.isConnected() || !(await this.rabbit.queueDepth(QUEUES.WEBHOOKS))) {
      throw new AppError(
        ERROR_CODES.EVENT_BUS_UNAVAILABLE,
        'The message broker is unavailable, try again shortly',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    await this.rabbit.publishToQueue(QUEUES.WEBHOOKS, event.payload, {
      [TARGET_ENDPOINT_HEADER]: attempt.endpointId,
      'x-correlation-id': event.correlationId,
    });
    await this.audit.record({
      actor,
      action: 'webhook_attempt.retried',
      entityType: 'WebhookAttempt',
      entityId: attempt.id,
      metadata: { endpointId: attempt.endpointId, eventId: attempt.eventId },
    });
    return { queued: true };
  }
}
