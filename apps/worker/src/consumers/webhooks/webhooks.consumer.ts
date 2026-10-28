import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { domainEvent, QUEUES, WEBHOOK_HEADERS, type DomainEvent } from '@swiftdrop/contracts';
import type { WebhookEndpoint } from '@swiftdrop/db';
import { InjectConfig, type WorkerEnv } from '../../config/config.module';
import { isProcessed, markProcessed } from '../../infra/idempotency';
import { PrismaService } from '../../infra/prisma.service';
import { RabbitMqService } from '../../infra/rabbitmq.service';
import {
  nextDelay,
  stringHeader,
  TARGET_ENDPOINT_HEADER,
  TransientError,
  type ConsumeContext,
} from '../../infra/retry';
import { decryptSecret } from './secret-crypto';
import { signPayload } from './signature';

export const WEBHOOKS_CONSUMER = 'webhooks';

const MAX_ERROR_LENGTH = 200;

type Outcome = 'succeeded' | 'failed' | 'retry' | 'dead';

/**
 * Delivers parcel events to merchant webhook endpoints. Owner: M8 (endpoint config is M5's).
 *
 * Per endpoint: sign `${t}.${body}` with the decrypted secret, POST with a timeout, and record one
 * `WebhookAttempt` per try:
 *   2xx → SUCCEEDED · 408/429/5xx/network → FAILED + retry (backoff) · other 4xx → FAILED, no retry ·
 *   retries exhausted → DEAD (the message is dead-lettered and shows up in /admin/ops).
 *
 * Idempotency is per endpoint (`processed_events` consumer key `webhooks:<endpointId>`), written
 * only once an endpoint reaches a final state, so a retry of the whole event never re-sends to an
 * endpoint that already succeeded.
 */
@Injectable()
export class WebhooksConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(WebhooksConsumer.name);

  constructor(
    @InjectConfig() private readonly config: WorkerEnv,
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
  ) {}

  async onApplicationBootstrap() {
    await this.rabbit.consume(QUEUES.WEBHOOKS, (payload, msg, ctx) =>
      this.handle(payload, ctx, stringHeader(msg.properties.headers, TARGET_ENDPOINT_HEADER)),
    );
  }

  /**
   * @param targetEndpointId set by the ops "retry" action: deliver to this endpoint only, even if it
   *   already reached a final state before.
   */
  async handle(
    payload: unknown,
    ctx: ConsumeContext = { attempt: 0, lastAttempt: false },
    targetEndpointId?: string,
  ): Promise<void> {
    const parsed = domainEvent.safeParse(payload);
    if (!parsed.success) throw new Error('invalid event payload'); // permanent → dead-letter
    const event = parsed.data;

    const merchantId = 'merchantId' in event.data ? event.data.merchantId : null;
    if (!merchantId) return;

    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        merchantId,
        isActive: true,
        eventTypes: { has: event.eventType },
        ...(targetEndpointId ? { id: targetEndpointId } : {}),
      },
      orderBy: { id: 'asc' },
    });

    const body = JSON.stringify(event);
    const outcomes: Outcome[] = [];
    for (const endpoint of endpoints) {
      if (
        !targetEndpointId &&
        (await isProcessed(this.prisma, consumerKey(endpoint), event.eventId))
      ) {
        continue;
      }
      outcomes.push(await this.deliver(endpoint, event, body, ctx));
    }

    if (outcomes.includes('retry')) {
      throw new TransientError(`webhook delivery for event ${event.eventId} will be retried`);
    }
    if (outcomes.includes('dead')) {
      // Attempts are already recorded as DEAD; failing the message sends it to the DLQ.
      throw new Error(`webhook delivery for event ${event.eventId} exhausted its retries`);
    }
  }

  private async deliver(
    endpoint: WebhookEndpoint,
    event: DomainEvent,
    body: string,
    ctx: ConsumeContext,
  ): Promise<Outcome> {
    const attemptNumber =
      (await this.prisma.webhookAttempt.count({
        where: { endpointId: endpoint.id, eventId: event.eventId },
      })) + 1;

    const started = Date.now();
    const result = await this.post(endpoint, event, body);
    const durationMs = Date.now() - started;

    let outcome: Outcome;
    let nextRetryAt: Date | null = null;
    if (result.status !== null && result.status >= 200 && result.status < 300) {
      outcome = 'succeeded';
    } else if (result.permanent || !isRetryable(result.status)) {
      outcome = 'failed';
    } else {
      const delay = nextDelay(this.config.WEBHOOK_RETRY_DELAYS_MS, ctx.attempt);
      outcome = delay === null ? 'dead' : 'retry';
      if (delay !== null) nextRetryAt = new Date(Date.now() + delay);
    }

    await this.prisma.webhookAttempt.create({
      data: {
        endpointId: endpoint.id,
        eventId: event.eventId,
        attemptNumber,
        status: outcome === 'succeeded' ? 'SUCCEEDED' : outcome === 'dead' ? 'DEAD' : 'FAILED',
        responseStatus: result.status,
        errorMessage: result.error ?? null,
        durationMs,
        nextRetryAt,
      },
    });
    // Final states are remembered so a retry of the event skips this endpoint.
    if (outcome !== 'retry') await markProcessed(this.prisma, consumerKey(endpoint), event.eventId);

    this.logger.log(
      `webhook ${outcome} endpoint=${endpoint.id} event=${event.eventId} correlation=${event.correlationId} status=${result.status ?? 'none'} attempt=${attemptNumber}`,
    );
    return outcome;
  }

  /** One signed POST. Never throws; failures come back as `status: null` or an error string. */
  private async post(
    endpoint: WebhookEndpoint,
    event: DomainEvent,
    body: string,
  ): Promise<{ status: number | null; error?: string; permanent?: boolean }> {
    let secret: string;
    try {
      secret = decryptSecret(endpoint.secretEncrypted, this.config.WEBHOOK_SECRET_ENC_KEY);
    } catch {
      return { status: null, error: 'signing secret could not be decrypted', permanent: true };
    }
    if (!/^https?:\/\//i.test(endpoint.url)) {
      return { status: null, error: 'endpoint url is not http(s)', permanent: true };
    }

    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SwiftDrop-Webhooks/1',
          [WEBHOOK_HEADERS.EVENT_ID]: event.eventId,
          [WEBHOOK_HEADERS.EVENT_TYPE]: event.eventType,
          [WEBHOOK_HEADERS.SIGNATURE]: signPayload(secret, body),
        },
        body,
        redirect: 'manual', // a redirect is not a delivery, and must not leak the signed body elsewhere
        signal: AbortSignal.timeout(this.config.WEBHOOK_TIMEOUT_MS),
      });
      await res.body?.cancel();
      return { status: res.status, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (err) {
      return { status: null, error: describeNetworkError(err) };
    }
  }
}

const consumerKey = (endpoint: Pick<WebhookEndpoint, 'id'>) =>
  `${WEBHOOKS_CONSUMER}:${endpoint.id}`;

/** Error text safe to store: a code or name, never a URL or response body. */
function describeNetworkError(err: unknown): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'request timed out';
  return `network error (${e?.cause?.code ?? e?.code ?? e?.name ?? 'unknown'})`.slice(
    0,
    MAX_ERROR_LENGTH,
  );
}

/** Retry policy — pure function, unit-tested. */
export function isRetryable(status: number | null): boolean {
  if (status === null) return true; // network error / timeout
  return status === 408 || status === 429 || status >= 500;
}
