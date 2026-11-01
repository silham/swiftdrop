import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EVENTS_EXCHANGE } from '@swiftdrop/contracts';
import * as amqp from 'amqp-connection-manager';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import { InjectConfig, type Env } from '../../config/config.module';

/**
 * Thin RabbitMQ wrapper for the API process (auto-reconnects).
 * The API does NOT publish domain events directly — use OutboxService. The API only SUBSCRIBES,
 * e.g. M4's SSE fan-out uses `subscribeExclusive` with a per-instance auto-delete queue.
 * Owner: M8.
 */
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection?: amqp.AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(@InjectConfig() private readonly config: Env) {}

  onModuleInit() {
    this.connection = amqp.connect([this.config.RABBITMQ_URL]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ connected'));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message}`),
    );
    this.channel = this.connection.createChannel({
      json: false,
      setup: (ch: Channel) => ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true }),
    });
  }

  isConnected(): boolean {
    return this.connection?.isConnected() ?? false;
  }

  /**
   * Message/consumer counts of a queue (passive declare), or null if it does not exist or the
   * broker is unreachable. Each call opens its own short-lived channel: a passive declare of a
   * missing queue makes the broker close that channel, and that must not disturb the SSE
   * subscriber channel or the next lookup.
   */
  async queueDepth(queue: string): Promise<{ messages: number; consumers: number } | null> {
    const conn = this.connection?.connection;
    if (!conn) return null;
    let ch: Channel | undefined;
    try {
      ch = await conn.createChannel();
      // The broker closing the channel (missing queue) is emitted as 'error'; it is expected here.
      ch.on('error', () => undefined);
      const q = await ch.checkQueue(queue);
      return { messages: q.messageCount, consumers: q.consumerCount };
    } catch {
      return null;
    } finally {
      await ch?.close().catch(() => undefined);
    }
  }

  /**
   * Publish straight to a work queue (default exchange), with broker confirm (the channel wrapper
   * uses a confirm channel). Callers must check the queue exists first: the default exchange
   * silently drops messages for a missing queue. Only for operator re-queues (e.g. re-delivering one
   * webhook); domain events always go through OutboxService.
   */
  async publishToQueue(queue: string, body: unknown, headers: Record<string, string> = {}) {
    await this.channel!.sendToQueue(queue, Buffer.from(JSON.stringify(body)), {
      persistent: true,
      contentType: 'application/json',
      headers,
      // Fail instead of hanging the request if the broker drops mid-publish.
      timeout: 10_000,
    });
  }

  /**
   * Bind an exclusive, auto-delete queue to `swiftdrop.events` and consume it.
   * Suitable for per-instance fan-out (SSE). Not for work queues — those live in the worker.
   */
  async subscribeExclusive(
    queueName: string,
    bindingKeys: string[],
    onMessage: (payload: unknown, raw: ConsumeMessage) => void | Promise<void>,
  ): Promise<void> {
    await this.channel!.addSetup(async (ch: Channel) => {
      await ch.assertQueue(queueName, { exclusive: true, autoDelete: true, durable: false });
      for (const key of bindingKeys) await ch.bindQueue(queueName, EVENTS_EXCHANGE, key);
      await ch.consume(queueName, async (msg) => {
        if (!msg) return;
        try {
          await onMessage(JSON.parse(msg.content.toString()), msg);
        } catch (err) {
          this.logger.error(`subscriber ${queueName} failed: ${(err as Error).message}`);
        } finally {
          ch.ack(msg);
        }
      });
    });
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
