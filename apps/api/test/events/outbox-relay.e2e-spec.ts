/**
 * Outbox → relay → queue (ADR-0002). Runs the worker's OutboxRelayService against the TEST database
 * and the real RabbitMQ broker, then reads the result from a temp queue bound to `parcel.#`.
 * Owner: M8.
 */
import { randomUUID } from 'node:crypto';
import { routingKey } from '@swiftdrop/contracts';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import {
  RABBITMQ_URL,
  until,
  worker,
  workerConfig,
  type OutboxRelayService,
  type PrismaService,
  type RabbitMqService,
} from './worker';

const config = workerConfig();

describe('outbox relay', () => {
  let prisma: PrismaService;
  let rabbit: RabbitMqService;
  let relay: OutboxRelayService;
  let connection: ChannelModel;
  let channel: Channel;
  let queue: string;

  /** Insert an unpublished outbox row shaped like OutboxService.enqueue writes it. */
  async function insertEvent(createdAt: Date) {
    const eventId = randomUUID();
    const data = {
      parcelId: `p-${eventId}`,
      trackingNumber: 'SD1',
      merchantId: null,
      customerId: null,
    };
    const payload = {
      eventId,
      eventType: 'parcel.created',
      eventVersion: 1,
      occurredAt: createdAt.toISOString(),
      correlationId: `corr-${eventId}`,
      data,
    };
    await prisma.outboxEvent.create({
      data: {
        id: eventId,
        eventType: 'parcel.created',
        eventVersion: 1,
        routingKey: routingKey('parcel.created', 1),
        payload,
        correlationId: payload.correlationId,
        createdAt,
      },
    });
    return payload;
  }

  /** Drain `n` messages from the temp queue (fails if they don't arrive). */
  async function receive(n: number) {
    const messages: {
      body: { eventId: string };
      headers: Record<string, unknown>;
      rk: string;
    }[] = [];
    await until(async () => {
      for (
        let m = await channel.get(queue, { noAck: true });
        m;
        m = await channel.get(queue, { noAck: true })
      ) {
        messages.push({
          body: JSON.parse(m.content.toString()),
          headers: m.properties.headers ?? {},
          rk: m.fields.routingKey,
        });
      }
      return messages.length >= n;
    });
    return messages;
  }

  beforeAll(async () => {
    prisma = new worker.PrismaService(config);
    rabbit = new worker.RabbitMqService(config);
    rabbit.onModuleInit();
    await until(() => rabbit.isConnected());
    relay = new worker.OutboxRelayService(config, prisma, rabbit);

    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    // The relay's channel asserts the exchange on connect; wait until it exists before binding.
    await until(async () => {
      try {
        const probe = await connection.createChannel();
        await probe.checkExchange('swiftdrop.events');
        await probe.close();
        return true;
      } catch {
        return false;
      }
    });
    ({ queue } = await channel.assertQueue('', { exclusive: true, autoDelete: true }));
    await channel.bindQueue(queue, 'swiftdrop.events', 'parcel.#');
  });

  afterAll(async () => {
    await channel?.close();
    await connection?.close();
    await rabbit?.onModuleDestroy();
    await prisma?.onModuleDestroy();
  });

  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany();
    await channel.purgeQueue(queue);
  });

  it('publishes unpublished rows oldest-first and sets publishedAt', async () => {
    const now = Date.now();
    const second = await insertEvent(new Date(now - 1_000));
    const first = await insertEvent(new Date(now - 2_000));

    expect(await relay.relayOnce()).toBe(2);

    const messages = await receive(2);
    expect(messages.map((m) => m.body.eventId)).toEqual([first.eventId, second.eventId]);
    expect(messages[0]!.rk).toBe('parcel.created.v1');
    expect(messages[0]!.headers['x-correlation-id']).toBe(first.correlationId);
    expect(messages[0]!.body).toEqual(first);

    const rows = await prisma.outboxEvent.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.publishedAt !== null && r.attempts === 0)).toBe(true);
  });

  it('does not publish an already-published row again', async () => {
    await insertEvent(new Date());
    expect(await relay.relayOnce()).toBe(1);
    expect(await relay.relayOnce()).toBe(0);
    expect(await receive(1)).toHaveLength(1);
  });

  it('lets concurrent relays share the backlog without duplicates (SKIP LOCKED)', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      ids.add((await insertEvent(new Date(Date.now() - 100 + i))).eventId);
    }

    const [a, b] = await Promise.all([relay.relayOnce(), relay.relayOnce()]);
    expect(a + b).toBe(10);

    const messages = await receive(10);
    expect(new Set(messages.map((m) => m.body.eventId))).toEqual(ids);
    expect(messages).toHaveLength(10);
  });

  it('purges rows published more than 7 days ago and never touches unpublished ones', async () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const row = async (ageDays: number, published: boolean) => {
      const e = await insertEvent(new Date(now - ageDays * day));
      if (published) {
        await prisma.outboxEvent.update({
          where: { id: e.eventId },
          data: { publishedAt: new Date(now - ageDays * day) },
        });
      }
      return e.eventId;
    };
    const oldPublished = await row(8, true);
    const recentPublished = await row(1, true);
    const oldUnpublished = await row(30, false);

    expect(await relay.purgePublished()).toBe(1);

    const left = (await prisma.outboxEvent.findMany()).map((r) => r.id);
    expect(left).not.toContain(oldPublished);
    expect(left).toEqual(expect.arrayContaining([recentPublished, oldUnpublished]));
  });

  it('on a publish failure records attempts/lastError and stops the batch', async () => {
    const now = Date.now();
    const a = await insertEvent(new Date(now - 3_000));
    const b = await insertEvent(new Date(now - 2_000));
    const c = await insertEvent(new Date(now - 1_000));

    const publish = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('broker unavailable'));
    const failing = new worker.OutboxRelayService(config, prisma, { publish });

    expect(await failing.relayOnce()).toBe(1);
    expect(publish).toHaveBeenCalledTimes(2);

    const byId = Object.fromEntries((await prisma.outboxEvent.findMany()).map((r) => [r.id, r]));
    expect(byId[a.eventId]!.publishedAt).not.toBeNull();
    expect(byId[b.eventId]).toMatchObject({
      publishedAt: null,
      attempts: 1,
      lastError: 'broker unavailable',
    });
    expect(byId[c.eventId]).toMatchObject({ publishedAt: null, attempts: 0, lastError: null });

    // The row is not lost: once the broker is back the next run publishes b then c.
    expect(await relay.relayOnce()).toBe(2);
    expect((await receive(2)).map((m) => m.body.eventId)).toEqual([b.eventId, c.eventId]);
  });
});
