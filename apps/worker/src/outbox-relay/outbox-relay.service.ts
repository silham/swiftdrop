import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InjectConfig, type WorkerEnv } from '../config/config.module';
import { PrismaService } from '../infra/prisma.service';
import { RabbitMqService } from '../infra/rabbitmq.service';

const MAX_ERROR_LENGTH = 500;
/** Published rows are kept this long, then purged (docs/members/M08: "older than 7 days"). */
export const OUTBOX_RETENTION_DAYS = 7;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

interface OutboxRow {
  id: string;
  routingKey: string;
  payload: unknown;
  correlationId: string;
}

/**
 * Transactional-outbox relay (ADR-0002). Polls `outbox_events` WHERE publishedAt IS NULL and
 * publishes each row to `swiftdrop.events` with its routingKey, then sets publishedAt.
 * Owner: M8.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastPurge = 0;

  constructor(
    @InjectConfig() private readonly config: WorkerEnv,
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), this.config.OUTBOX_POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      if (this.rabbit.isConnected()) {
        const published = await this.relayOnce();
        if (published > 0) this.logger.debug(`published ${published} outbox event(s)`);
      }
      if (Date.now() - this.lastPurge >= PURGE_INTERVAL_MS) {
        this.lastPurge = Date.now();
        const purged = await this.purgePublished();
        if (purged > 0) this.logger.log(`purged ${purged} published outbox event(s)`);
      }
    } catch (err) {
      this.logger.error(`relay failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Delete rows that were published more than OUTBOX_RETENTION_DAYS ago (unpublished rows are never
   * touched). The outbox row is also what the ops "retry" action re-publishes, so a webhook attempt
   * older than the retention can no longer be retried.
   */
  async purgePublished(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - OUTBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.outboxEvent.deleteMany({
      where: { publishedAt: { lt: cutoff } },
    });
    return count;
  }

  /**
   * Publish one batch in oldest-first order; returns how many rows were published.
   * Rows are locked with FOR UPDATE SKIP LOCKED so several workers can run side by side. A publish
   * failure records `attempts`/`lastError` and stops the batch (keeps ordering, never loses a row).
   * Delivery is at-least-once: a crash between publish and commit re-publishes, consumers dedupe.
   */
  async relayOnce(): Promise<number> {
    const batchSize = this.config.OUTBOX_BATCH_SIZE;
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT "id", "routingKey", "payload", "correlationId"
          FROM "outbox_events"
          WHERE "publishedAt" IS NULL
          ORDER BY "createdAt", "id"
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED`;

        let published = 0;
        for (const row of rows) {
          try {
            await this.rabbit.publish(row.routingKey, row.payload, {
              'x-correlation-id': row.correlationId,
            });
          } catch (err) {
            await tx.outboxEvent.update({
              where: { id: row.id },
              data: {
                attempts: { increment: 1 },
                lastError: (err as Error).message.slice(0, MAX_ERROR_LENGTH),
              },
            });
            this.logger.warn(`publish failed for outbox event ${row.id}; stopping batch`);
            break;
          }
          await tx.outboxEvent.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
          published++;
        }
        return published;
      },
      // The transaction stays open while RabbitMQ confirms each publish.
      { maxWait: 5_000, timeout: 30_000 },
    );
  }
}
