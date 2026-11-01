/**
 * Retry queues, bounded backoff and dead-lettering of RabbitMqService.consume (M8).
 * Each test consumes its own throw-away queue (with its `.dlq` and `.retry.<delay>` queues) so it
 * never competes with the real notification/webhook workers.
 */
import { randomUUID } from 'node:crypto';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import {
  RABBITMQ_URL,
  until,
  worker,
  workerConfig,
  type ConsumeContext,
  type RabbitMqService,
} from './worker';

const DELAY_MS = 100;
const config = workerConfig({ WEBHOOK_RETRY_DELAYS_MS: [DELAY_MS, DELAY_MS] });

describe('RabbitMqService.consume: retry and dead-letter', () => {
  let rabbit: RabbitMqService;
  let connection: ChannelModel;
  let channel: Channel;
  let queue: string;

  const names = () => [queue, `${queue}.dlq`, `${queue}.retry.${DELAY_MS}ms`];

  async function dlqMessage() {
    let msg = false as Awaited<ReturnType<Channel['get']>>;
    await until(async () => {
      msg = await channel.get(`${queue}.dlq`, { noAck: true });
      return msg !== false;
    });
    return msg as Exclude<typeof msg, false>;
  }

  const send = (body: string) =>
    channel.sendToQueue(queue, Buffer.from(body), { persistent: true, headers: { k: 'v' } });

  beforeAll(async () => {
    rabbit = new worker.RabbitMqService(config);
    rabbit.onModuleInit();
    await until(() => rabbit.isConnected());
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
  });

  afterAll(async () => {
    // The service's own channel also declares the real work queues' retry queues with the short
    // test delay; remove them so they don't linger in the broker.
    for (const q of ['notifications.parcel-events', 'webhooks.parcel-events']) {
      await channel.deleteQueue(`${q}.retry.${DELAY_MS}ms`).catch(() => undefined);
    }
    await channel?.close();
    await connection?.close();
    await rabbit?.onModuleDestroy();
  });

  beforeEach(() => {
    queue = `test.retry.${randomUUID()}`;
  });

  afterEach(async () => {
    for (const name of names()) await channel.deleteQueue(name).catch(() => undefined);
  });

  it('retries a transient failure through the retry queue and then succeeds', async () => {
    const calls: ConsumeContext[] = [];
    await rabbit.consume(queue, async (_payload, _msg, ctx) => {
      calls.push(ctx);
      if (ctx.attempt === 0) throw new worker.TransientError('try again');
    });
    send(JSON.stringify({ hello: 'world' }));

    await until(() => calls.length === 2);
    expect(calls).toEqual([
      { attempt: 0, lastAttempt: false },
      { attempt: 1, lastAttempt: false },
    ]);
    // Acked after the retry: nothing is dead-lettered.
    await new Promise((r) => setTimeout(r, 300));
    expect((await channel.checkQueue(`${queue}.dlq`)).messageCount).toBe(0);
  });

  it('dead-letters once the retries are exhausted, keeping the attempt count', async () => {
    const calls: ConsumeContext[] = [];
    await rabbit.consume(queue, async (_payload, _msg, ctx) => {
      calls.push(ctx);
      throw new worker.TransientError('still failing');
    });
    send(JSON.stringify({ n: 1 }));

    const dead = await dlqMessage();
    expect(calls).toEqual([
      { attempt: 0, lastAttempt: false },
      { attempt: 1, lastAttempt: false },
      { attempt: 2, lastAttempt: true },
    ]);
    expect(JSON.parse(dead.content.toString())).toEqual({ n: 1 });
    expect(dead.properties.headers?.['x-attempt']).toBe(2);
    expect(dead.properties.headers?.k).toBe('v'); // original headers survive the retry hops
  });

  it('dead-letters a permanent error immediately, without retrying', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('bad data'));
    await rabbit.consume(queue, handler);
    send(JSON.stringify({ n: 2 }));

    await dlqMessage();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dead-letters a malformed (non-JSON) message without calling the handler', async () => {
    const handler = jest.fn();
    await rabbit.consume(queue, handler);
    send('this is not json');

    await dlqMessage();
    expect(handler).not.toHaveBeenCalled();
  });
});
