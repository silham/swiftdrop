/**
 * RabbitMQ topology owned by the worker (ADR-0002, docs/conventions/events.md). Owner: M8.
 *
 *   swiftdrop.events (topic) ──parcel.#──▶ notifications.parcel-events ──x-dead-letter──▶ swiftdrop.dlx ─▶ notifications.parcel-events.dlq
 *                             ──parcel.#──▶ webhooks.parcel-events      ──x-dead-letter──▶ swiftdrop.dlx ─▶ webhooks.parcel-events.dlq
 *
 * Retries with bounded backoff: per-delay queues `<queue>.retry.<delay>` with `x-message-ttl`
 * that dead-letter (via the default exchange) back to the work queue. A consumer republishes a
 * transiently failed message to the next retry queue; after the last delay it goes to the DLQ.
 */
import { DEAD_LETTER_EXCHANGE, EVENTS_EXCHANGE, QUEUES } from '@swiftdrop/contracts';
import type { Channel } from 'amqplib';
import { retryQueueName } from './retry';

export const WORK_QUEUES = [QUEUES.NOTIFICATIONS, QUEUES.WEBHOOKS] as const;

/** Work queue + its `.dlq` + one retry queue per distinct delay. Idempotent. */
export async function assertWorkQueue(
  ch: Channel,
  queue: string,
  retryDelaysMs: readonly number[],
): Promise<void> {
  await ch.assertQueue(`${queue}.dlq`, { durable: true });
  await ch.bindQueue(`${queue}.dlq`, DEAD_LETTER_EXCHANGE, queue);
  await ch.assertQueue(queue, {
    durable: true,
    deadLetterExchange: DEAD_LETTER_EXCHANGE,
    deadLetterRoutingKey: queue,
  });
  for (const delay of new Set(retryDelaysMs)) {
    await ch.assertQueue(retryQueueName(queue, delay), {
      durable: true,
      messageTtl: delay,
      // '' = default exchange: routing key = queue name delivers straight back to the work queue.
      deadLetterExchange: '',
      deadLetterRoutingKey: queue,
    });
  }
}

export async function assertTopology(ch: Channel, retryDelaysMs: readonly number[]): Promise<void> {
  await ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
  await ch.assertExchange(DEAD_LETTER_EXCHANGE, 'direct', { durable: true });
  for (const q of WORK_QUEUES) {
    await assertWorkQueue(ch, q, retryDelaysMs);
    await ch.bindQueue(q, EVENTS_EXCHANGE, 'parcel.#');
  }
}
