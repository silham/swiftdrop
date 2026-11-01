import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EVENTS_EXCHANGE } from '@swiftdrop/contracts';
import * as amqp from 'amqp-connection-manager';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { InjectConfig, type WorkerEnv } from '../config/config.module';
import {
  ATTEMPT_HEADER,
  attemptOf,
  nextDelay,
  retryQueueName,
  TransientError,
  type ConsumeContext,
} from './retry';
import { assertTopology, assertWorkQueue } from './topology';

export type MessageHandler = (
  payload: unknown,
  msg: ConsumeMessage,
  ctx: ConsumeContext,
) => Promise<void>;

/** Broker-added death bookkeeping; dropped when a message is moved to a retry queue. */
const BROKER_HEADERS = /^x-(death|first-death-|last-death-)/;

/** Connection + confirm channel for publishing, and a helper to register consumers. Owner: M8. */
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection!: amqp.AmqpConnectionManager;
  private publisher!: ChannelWrapper;

  constructor(@InjectConfig() private readonly config: WorkerEnv) {}

  onModuleInit() {
    this.connection = amqp.connect([this.config.RABBITMQ_URL]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ connected'));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message}`),
    );
    this.publisher = this.connection.createChannel({
      json: false,
      confirm: true,
      setup: (ch: Channel) => assertTopology(ch, this.config.WEBHOOK_RETRY_DELAYS_MS),
    });
  }

  isConnected() {
    return this.connection?.isConnected() ?? false;
  }

  /** Publish with broker confirm. Resolves only when RabbitMQ has accepted the message. */
  async publish(routingKey: string, body: unknown, headers: Record<string, string> = {}) {
    await this.publisher.publish(EVENTS_EXCHANGE, routingKey, Buffer.from(JSON.stringify(body)), {
      persistent: true,
      contentType: 'application/json',
      headers,
    });
  }

  /**
   * Consume a durable work queue (created, with its DLQ and retry queues, if missing).
   *  - handler succeeds → ack
   *  - handler throws `TransientError` and a retry is left → copy to the next retry queue
   *    (`x-attempt` + 1), then ack; the TTL brings it back to the work queue
   *  - anything else (permanent error, malformed JSON, retries exhausted) → nack(requeue=false),
   *    which dead-letters to `<queue>.dlq`
   */
  async consume(queue: string, handler: MessageHandler, prefetch = 10) {
    const delays = this.config.WEBHOOK_RETRY_DELAYS_MS;
    const channel = this.connection.createChannel({
      confirm: true,
      setup: async (ch: ConfirmChannel) => {
        await assertTopology(ch, delays);
        await assertWorkQueue(ch, queue, delays);
        await ch.prefetch(prefetch);
        await ch.consume(queue, async (msg) => {
          if (!msg) return;
          const attempt = attemptOf(msg.properties.headers);
          const ctx: ConsumeContext = { attempt, lastAttempt: nextDelay(delays, attempt) === null };
          try {
            await handler(JSON.parse(msg.content.toString()), msg, ctx);
            ch.ack(msg);
            return;
          } catch (err) {
            const delay = err instanceof TransientError ? nextDelay(delays, attempt) : null;
            if (delay !== null) {
              try {
                await this.sendToRetryQueue(ch, queue, msg, delay, attempt + 1);
                this.logger.warn(
                  `[${queue}] transient failure (${(err as Error).message}); retry ${attempt + 1}/${delays.length}`,
                );
                ch.ack(msg);
                return;
              } catch (retryErr) {
                this.logger.error(
                  `[${queue}] could not schedule retry: ${(retryErr as Error).message}`,
                );
              }
            }
            this.logger.error(`[${queue}] dead-lettering: ${(err as Error).message}`);
            ch.nack(msg, false, false);
          }
        });
      },
    });
    await channel.waitForConnect();
  }

  private sendToRetryQueue(
    ch: ConfirmChannel,
    queue: string,
    msg: ConsumeMessage,
    delayMs: number,
    nextAttempt: number,
  ): Promise<void> {
    const headers = Object.fromEntries(
      Object.entries(msg.properties.headers ?? {}).filter(([k]) => !BROKER_HEADERS.test(k)),
    );
    return new Promise((resolve, reject) => {
      ch.sendToQueue(
        retryQueueName(queue, delayMs),
        msg.content,
        {
          persistent: true,
          contentType: 'application/json',
          headers: { ...headers, [ATTEMPT_HEADER]: nextAttempt },
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async onModuleDestroy() {
    await this.connection?.close();
  }
}
