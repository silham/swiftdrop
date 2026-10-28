/**
 * Notification + webhook consumers against the TEST database (M8).
 * The consumers' `handle()` is driven directly (no shared RabbitMQ queue is consumed, so a running
 * dev worker cannot steal messages); the end-to-end test below also runs the real outbox relay.
 * Fresh parcels/endpoints are created per test with random ids.
 */
import { randomUUID } from 'node:crypto';
import { routingKey } from '@swiftdrop/contracts';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import {
  closedPortUrl,
  RABBITMQ_URL,
  startEndpointServer,
  until,
  worker,
  workerConfig,
  type FakeMail,
  type NotificationsConsumer,
  type PrismaService,
  type RabbitMqService,
  type WebhooksConsumer,
} from './worker';

const config = workerConfig();
const SECRET = 'whsec_test_secret';
const RECIPIENT_PHONE = '+94771234567';

describe('event consumers', () => {
  let prisma: PrismaService;
  let webhooks: WebhooksConsumer;
  let notifications: NotificationsConsumer;
  let mail: FakeMail;
  let customer: { id: string; email: string };
  let merchantId: string;
  const servers: Awaited<ReturnType<typeof startEndpointServer>>[] = [];

  const base = () => ({
    eventId: randomUUID(),
    eventVersion: 1 as const,
    occurredAt: new Date().toISOString(),
    correlationId: `corr-${randomUUID()}`,
  });

  async function newParcel(opts: { merchant?: boolean; customer?: boolean } = {}) {
    const tn = `SD9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const parcel = await prisma.parcel.create({
      data: {
        trackingNumber: tn,
        customerId: opts.customer === false ? null : customer.id,
        merchantId: opts.merchant === false ? null : merchantId,
        senderName: 'Sender',
        senderPhone: '+94770000000',
        pickupAddress: '1 Pickup Rd',
        pickupCity: 'colombo',
        recipientName: 'Recipient',
        recipientPhone: RECIPIENT_PHONE,
        recipientEmail: `recipient-${randomUUID().slice(0, 8)}@example.test`,
        dropoffAddress: '2 Dropoff Rd',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 1,
        feeCents: 1000,
      },
    });
    return parcel;
  }

  const statusChanged = (
    parcel: { id: string; trackingNumber: string; merchantId: string | null },
    newStatus = 'DELIVERED',
  ) => ({
    ...base(),
    eventType: 'parcel.status_changed' as const,
    data: {
      parcelId: parcel.id,
      trackingNumber: parcel.trackingNumber,
      merchantId: parcel.merchantId,
      customerId: customer.id,
      previousStatus: 'OUT_FOR_DELIVERY',
      newStatus,
      actorRole: 'COURIER',
    },
  });

  const created = (parcel: { id: string; trackingNumber: string; merchantId: string | null }) => ({
    ...base(),
    eventType: 'parcel.created' as const,
    data: {
      parcelId: parcel.id,
      trackingNumber: parcel.trackingNumber,
      merchantId: parcel.merchantId,
      customerId: customer.id,
    },
  });

  async function newEndpoint(
    url: string,
    extra: { isActive?: boolean; eventTypes?: string[] } = {},
  ) {
    return prisma.webhookEndpoint.create({
      data: {
        merchantId,
        url,
        secretEncrypted: worker.encryptSecret(SECRET, config.WEBHOOK_SECRET_ENC_KEY),
        eventTypes: extra.eventTypes ?? ['parcel.status_changed', 'parcel.created'],
        isActive: extra.isActive ?? true,
      },
    });
  }

  const attemptsOf = (endpointId: string) =>
    prisma.webhookAttempt.findMany({ where: { endpointId }, orderBy: { attemptNumber: 'asc' } });
  const processedKeys = async (eventId: string) =>
    (await prisma.processedEvent.findMany({ where: { eventId } })).map((p) => p.consumer);

  async function newServer() {
    const server = await startEndpointServer();
    servers.push(server);
    return server;
  }

  beforeAll(async () => {
    prisma = new worker.PrismaService(config);
    mail = { sendEmail: jest.fn(), sendSms: jest.fn() };
    // Two retries, so `attempt: 2` is the last one in the tests below.
    webhooks = new worker.WebhooksConsumer(
      { ...config, WEBHOOK_RETRY_DELAYS_MS: [100, 100] },
      null,
      prisma,
    );
    notifications = new worker.NotificationsConsumer(config, null, prisma, mail);
    customer = await prisma.user.findUniqueOrThrow({
      where: { email: 'customer@swiftdrop.test' },
      select: { id: true, email: true },
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: 'merchant@swiftdrop.test' },
    });
    merchantId = (await prisma.merchant.findUniqueOrThrow({ where: { ownerUserId: owner.id } })).id;
  });

  afterAll(async () => {
    await Promise.all(servers.map((s) => s.close()));
    await prisma.webhookEndpoint.deleteMany({ where: { merchantId } }); // cascades attempts
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Every active endpoint of the merchant receives each event, so start each test with none.
    await prisma.webhookEndpoint.deleteMany({ where: { merchantId } }); // cascades attempts
    mail.sendEmail.mockReset().mockResolvedValue(undefined);
    mail.sendSms.mockReset().mockResolvedValue(undefined);
  });

  describe('webhooks', () => {
    it('delivers the signed event envelope once, even if the event is redelivered', async () => {
      const server = await newServer();
      const endpoint = await newEndpoint(server.url);
      const event = statusChanged(await newParcel());

      await webhooks.handle(event);
      await webhooks.handle(event); // duplicate delivery

      expect(server.requests).toHaveLength(1);
      const req = server.requests[0]!;
      expect(JSON.parse(req.body)).toEqual(event);
      expect(req.headers['x-swiftdrop-event-id']).toBe(event.eventId);
      expect(req.headers['x-swiftdrop-event-type']).toBe('parcel.status_changed');
      expect(
        worker.verifySignature([SECRET], req.body, String(req.headers['x-swiftdrop-signature'])),
      ).toBe(true);

      const attempts = await attemptsOf(endpoint.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({ status: 'SUCCEEDED', responseStatus: 200 });
      expect(attempts[0]!.durationMs).not.toBeNull();
    });

    it('retries a 5xx with FAILED attempts, then records DEAD when retries are exhausted', async () => {
      const server = await newServer();
      server.respond.status = 503;
      const endpoint = await newEndpoint(server.url);
      const event = statusChanged(await newParcel());

      await expect(
        webhooks.handle(event, { attempt: 0, lastAttempt: false }),
      ).rejects.toBeInstanceOf(worker.TransientError);
      await expect(
        webhooks.handle(event, { attempt: 1, lastAttempt: false }),
      ).rejects.toBeInstanceOf(worker.TransientError);
      // Last attempt: a plain error (not transient) so the consumer dead-letters the message.
      const last = webhooks.handle(event, { attempt: 2, lastAttempt: true });
      await expect(last).rejects.not.toBeInstanceOf(worker.TransientError);
      await expect(last).rejects.toThrow(/exhausted/);

      const attempts = await attemptsOf(endpoint.id);
      expect(attempts.map((a) => [a.attemptNumber, a.status])).toEqual([
        [1, 'FAILED'],
        [2, 'FAILED'],
        [3, 'DEAD'],
      ]);
      expect(attempts[0]!.nextRetryAt).not.toBeNull();
      expect(attempts[2]!.nextRetryAt).toBeNull();
      expect(attempts.every((a) => a.responseStatus === 503)).toBe(true);
      expect(await processedKeys(event.eventId)).toContain(`webhooks:${endpoint.id}`);
    });

    it('does not retry a 4xx: one FAILED attempt and no error', async () => {
      const server = await newServer();
      server.respond.status = 410;
      const endpoint = await newEndpoint(server.url);

      await expect(webhooks.handle(statusChanged(await newParcel()))).resolves.toBeUndefined();

      expect(server.requests).toHaveLength(1);
      const attempts = await attemptsOf(endpoint.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        status: 'FAILED',
        responseStatus: 410,
        nextRetryAt: null,
      });
    });

    it('treats an unavailable endpoint (connection refused) as transient, ending in DEAD', async () => {
      const endpoint = await newEndpoint(await closedPortUrl());
      const event = statusChanged(await newParcel());

      await expect(
        webhooks.handle(event, { attempt: 0, lastAttempt: false }),
      ).rejects.toBeInstanceOf(worker.TransientError);
      await expect(webhooks.handle(event, { attempt: 2, lastAttempt: true })).rejects.toThrow(
        /exhausted/,
      );

      const attempts = await attemptsOf(endpoint.id);
      expect(attempts.map((a) => a.status)).toEqual(['FAILED', 'DEAD']);
      expect(attempts[0]!.responseStatus).toBeNull();
      expect(attempts[0]!.errorMessage).toMatch(/network error/);
    });

    it('does not re-send to an endpoint that already succeeded when another one is retried', async () => {
      const good = await newServer();
      const flaky = await newServer();
      flaky.respond.status = 500;
      const goodEndpoint = await newEndpoint(good.url);
      const flakyEndpoint = await newEndpoint(flaky.url);
      const event = statusChanged(await newParcel());

      await expect(
        webhooks.handle(event, { attempt: 0, lastAttempt: false }),
      ).rejects.toBeInstanceOf(worker.TransientError);
      flaky.respond.status = 200;
      await webhooks.handle(event, { attempt: 1, lastAttempt: false });

      expect(good.requests).toHaveLength(1);
      expect(flaky.requests).toHaveLength(2);
      expect((await attemptsOf(goodEndpoint.id)).map((a) => a.status)).toEqual(['SUCCEEDED']);
      expect((await attemptsOf(flakyEndpoint.id)).map((a) => a.status)).toEqual([
        'FAILED',
        'SUCCEEDED',
      ]);
    });

    it('skips events without a merchant, inactive endpoints and unsubscribed event types', async () => {
      const server = await newServer();
      await newEndpoint(server.url, { isActive: false });
      await newEndpoint(server.url, { eventTypes: ['parcel.created'] });

      await webhooks.handle(statusChanged(await newParcel({ merchant: false })));
      await webhooks.handle(statusChanged(await newParcel()));

      expect(server.requests).toHaveLength(0);
    });

    it('re-delivers to a single endpoint when targeted by an operator retry', async () => {
      const server = await newServer();
      const other = await newServer();
      const endpoint = await newEndpoint(server.url);
      await newEndpoint(other.url);
      const event = statusChanged(await newParcel());
      await webhooks.handle(event);
      expect(server.requests).toHaveLength(1);
      expect(other.requests).toHaveLength(1);

      await webhooks.handle(event, undefined, endpoint.id);

      expect(server.requests).toHaveLength(2);
      expect(other.requests).toHaveLength(1);
      expect(await attemptsOf(endpoint.id)).toHaveLength(2);
    });

    it('dead-letters an invalid event instead of delivering it', async () => {
      await expect(webhooks.handle({ eventType: 'nope' })).rejects.toThrow(/invalid event/);
    });
  });

  describe('notifications', () => {
    it('emails the customer and recipient and texts the recipient, logging masked recipients', async () => {
      const parcel = await newParcel();
      const event = created(parcel);

      await notifications.handle(event);

      expect(mail.sendEmail).toHaveBeenCalledTimes(2);
      expect(mail.sendEmail.mock.calls.map((c) => c[0]).sort()).toEqual(
        [customer.email, parcel.recipientEmail].sort(),
      );
      expect(mail.sendEmail.mock.calls[0]![1]).toContain(parcel.trackingNumber);
      expect(mail.sendSms).toHaveBeenCalledWith(RECIPIENT_PHONE, expect.stringContaining('SD9'));

      const logs = await prisma.notificationLog.findMany({ where: { eventId: event.eventId } });
      expect(logs.map((l) => `${l.channel}:${l.status}`).sort()).toEqual([
        'EMAIL:SENT',
        'EMAIL:SENT',
        'SMS:SENT',
      ]);
      const stored = logs.map((l) => l.recipient).join(' ');
      expect(stored).not.toContain(customer.email);
      expect(stored).not.toContain(parcel.recipientEmail!);
      expect(stored).not.toContain(RECIPIENT_PHONE);
    });

    it('emails both customer and recipient even when their addresses mask the same way', async () => {
      const parcel = await newParcel();
      // Same first letter, last letter and domain as the customer → identical masked form.
      const [local, domain] = customer.email.split('@') as [string, string];
      const lookalike = `${local[0]}xxxxxxxxx${local.slice(-1)}@${domain}`;
      await prisma.parcel.update({ where: { id: parcel.id }, data: { recipientEmail: lookalike } });

      await notifications.handle(created(parcel));

      expect(mail.sendEmail.mock.calls.map((c) => c[0]).sort()).toEqual(
        [customer.email, lookalike].sort(),
      );
    });

    it('sends a duplicate event only once (NotificationLog count stays the same)', async () => {
      const event = statusChanged(await newParcel());

      await notifications.handle(event);
      await notifications.handle(event);

      expect(mail.sendEmail).toHaveBeenCalledTimes(2);
      expect(mail.sendSms).toHaveBeenCalledTimes(1);
      expect(await prisma.notificationLog.count({ where: { eventId: event.eventId } })).toBe(3);
    });

    it('treats a provider error as transient and only re-sends what failed', async () => {
      const event = statusChanged(await newParcel());
      mail.sendEmail
        .mockResolvedValueOnce(undefined) // customer ok
        .mockRejectedValueOnce(Object.assign(new Error('smtp down'), { code: 'ECONNREFUSED' }));

      await expect(notifications.handle(event)).rejects.toBeInstanceOf(worker.TransientError);
      const failed = await prisma.notificationLog.findMany({
        where: { eventId: event.eventId, status: 'FAILED' },
      });
      expect(failed).toHaveLength(1);
      expect(failed[0]!.error).toBe('ECONNREFUSED'); // a code, never the provider's message

      await notifications.handle(event); // the retry

      expect(mail.sendEmail).toHaveBeenCalledTimes(3); // customer once + recipient twice
      expect(mail.sendSms).toHaveBeenCalledTimes(1);
      const logs = await prisma.notificationLog.findMany({ where: { eventId: event.eventId } });
      expect(logs).toHaveLength(3);
      expect(logs.every((l) => l.status === 'SENT' && l.error === null)).toBe(true);
    });

    it('does not notify for statuses without a template', async () => {
      const event = statusChanged(await newParcel(), 'IN_TRANSIT');

      await notifications.handle(event);

      expect(mail.sendEmail).not.toHaveBeenCalled();
      expect(mail.sendSms).not.toHaveBeenCalled();
      expect(await prisma.notificationLog.count({ where: { eventId: event.eventId } })).toBe(0);
    });

    it('skips (without failing) an event whose parcel does not exist', async () => {
      const ghost = { id: 'missing-parcel', trackingNumber: 'SD000000000', merchantId: null };

      await expect(notifications.handle(statusChanged(ghost))).resolves.toBeUndefined();
      expect(mail.sendEmail).not.toHaveBeenCalled();
    });

    it('dead-letters an invalid event', async () => {
      await expect(notifications.handle({ foo: 'bar' })).rejects.toThrow(/invalid event/);
    });
  });

  describe('status change → relay → notification + webhook', () => {
    let rabbit: RabbitMqService;
    let connection: ChannelModel;
    let channel: Channel;
    let queue: string;

    beforeAll(async () => {
      rabbit = new worker.RabbitMqService(config);
      rabbit.onModuleInit();
      await until(() => rabbit.isConnected());
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();
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
    });

    it('turns a committed status change into an email, an SMS and a signed webhook', async () => {
      const server = await newServer();
      const endpoint = await newEndpoint(server.url);
      const parcel = await newParcel();
      const event = statusChanged(parcel);
      await prisma.outboxEvent.create({
        data: {
          id: event.eventId,
          eventType: event.eventType,
          eventVersion: 1,
          routingKey: routingKey('parcel.status_changed', 1),
          payload: event,
          correlationId: event.correlationId,
        },
      });

      // outbox → relay → RabbitMQ (read back from a temp queue bound to parcel.#)
      const relay = new worker.OutboxRelayService(config, prisma, rabbit);
      await relay.relayOnce();
      const found: { body?: unknown } = {};
      await until(async () => {
        for (
          let m = await channel.get(queue, { noAck: true });
          m;
          m = await channel.get(queue, { noAck: true })
        ) {
          const body = JSON.parse(m.content.toString());
          if (body.eventId === event.eventId) found.body = body;
        }
        return found.body !== undefined;
      });
      const delivered = found.body;

      // …consumed by both consumers
      await notifications.handle(delivered);
      await webhooks.handle(delivered);

      expect(mail.sendEmail).toHaveBeenCalledWith(
        customer.email,
        expect.stringContaining('delivered'),
        expect.any(String),
      );
      expect(mail.sendSms).toHaveBeenCalledTimes(1);
      expect(server.requests).toHaveLength(1);
      expect(JSON.parse(server.requests[0]!.body).data.newStatus).toBe('DELIVERED');
      expect((await attemptsOf(endpoint.id))[0]).toMatchObject({ status: 'SUCCEEDED' });
      expect(
        (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.eventId } })).publishedAt,
      ).not.toBeNull();
    });
  });
});
