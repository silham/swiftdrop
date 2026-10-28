/**
 * GET /admin/ops/outbox, GET /admin/ops/webhook-attempts, POST /admin/ops/webhook-attempts/:id/retry
 * (M8). Admin-only: every other role and anonymous callers must be rejected.
 */
import { randomUUID } from 'node:crypto';
import type { Role } from '@swiftdrop/contracts';
import request from 'supertest';
import { RabbitMqService } from '../../src/infra/events';
import { createTestApp, type TestContext } from '../utils/app';
import { until, worker, workerConfig } from './worker';

const NON_ADMIN_ROLES: Role[] = ['CUSTOMER', 'MERCHANT', 'COURIER', 'DISPATCHER'];

describe('event ops endpoints', () => {
  let t: TestContext;
  let merchantId: string;
  let endpointId: string;

  async function newAttempt(status: 'DEAD' | 'FAILED' | 'SUCCEEDED', eventId = randomUUID()) {
    return t.prisma.webhookAttempt.create({
      data: {
        endpointId,
        eventId,
        attemptNumber: 1,
        status,
        responseStatus: status === 'SUCCEEDED' ? 200 : 503,
        errorMessage: status === 'SUCCEEDED' ? null : 'HTTP 503',
        durationMs: 12,
      },
    });
  }

  async function newOutboxEvent() {
    const eventId = randomUUID();
    const payload = {
      eventId,
      eventType: 'parcel.created',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: `corr-${eventId}`,
      data: { parcelId: 'p1', trackingNumber: 'SD1', merchantId, customerId: null },
    };
    await t.prisma.outboxEvent.create({
      data: {
        id: eventId,
        eventType: 'parcel.created',
        eventVersion: 1,
        routingKey: 'parcel.created.v1',
        payload,
        correlationId: payload.correlationId,
        publishedAt: new Date(),
      },
    });
    return eventId;
  }

  beforeAll(async () => {
    t = await createTestApp();
    await until(() => t.app.get(RabbitMqService).isConnected());
    const owner = await t.prisma.user.findUniqueOrThrow({
      where: { email: 'merchant@swiftdrop.test' },
    });
    merchantId = (await t.prisma.merchant.findUniqueOrThrow({ where: { ownerUserId: owner.id } }))
      .id;
    endpointId = (
      await t.prisma.webhookEndpoint.create({
        data: { merchantId, url: 'http://127.0.0.1:1/hook', secretEncrypted: 'not-a-real-secret' },
      })
    ).id;
  });

  afterAll(async () => {
    await t.prisma.webhookEndpoint.delete({ where: { id: endpointId } }); // cascades attempts
    await t.close();
  });

  describe('authorization', () => {
    const endpoints = [
      ['get', '/api/v1/admin/ops/outbox'],
      ['get', '/api/v1/admin/ops/queues'],
      ['get', '/api/v1/admin/ops/webhook-attempts'],
      ['post', '/api/v1/admin/ops/webhook-attempts/some-id/retry'],
    ] as const;

    it.each(endpoints)('%s %s rejects anonymous callers with 401', async (method, url) => {
      await request(t.http)[method](url).expect(401);
    });

    for (const role of NON_ADMIN_ROLES) {
      it.each(endpoints)(`%s %s rejects ${role} with 403`, async (method, url) => {
        await request(t.http)
          [method](url)
          .set('Cookie', await t.cookieFor(role))
          .expect(403);
      });
    }

    it('does not re-queue or audit anything for a rejected caller', async () => {
      const attempt = await newAttempt('DEAD', await newOutboxEvent());
      const before = await t.prisma.auditLog.count({ where: { entityId: attempt.id } });

      await request(t.http)
        .post(`/api/v1/admin/ops/webhook-attempts/${attempt.id}/retry`)
        .set('Cookie', await t.cookieFor('MERCHANT'))
        .expect(403);

      expect(await t.prisma.auditLog.count({ where: { entityId: attempt.id } })).toBe(before);
    });
  });

  describe('GET /admin/ops/outbox', () => {
    it('reports the unpublished backlog', async () => {
      const res = await request(t.http)
        .get('/api/v1/admin/ops/outbox')
        .set('Cookie', await t.cookieFor('ADMIN'))
        .expect(200);
      expect(res.body).toEqual({ pending: expect.any(Number), failing: expect.any(Number) });
    });
  });

  describe('GET /admin/ops/queues', () => {
    it('reports the depth of the work queues and their dead-letter queues', async () => {
      // Declare the real topology the way the worker does, so every queue exists.
      const broker = new worker.RabbitMqService(workerConfig());
      broker.onModuleInit();
      await until(() => broker.isConnected());
      // Ask twice: the first lookup after boot used to return null while the channel opened.
      await request(t.http)
        .get('/api/v1/admin/ops/queues')
        .set('Cookie', await t.cookieFor('ADMIN'));
      const res = await request(t.http)
        .get('/api/v1/admin/ops/queues')
        .set('Cookie', await t.cookieFor('ADMIN'))
        .expect(200);

      expect(res.body.map((q: { name: string; kind: string }) => [q.name, q.kind])).toEqual([
        ['notifications.parcel-events', 'work'],
        ['notifications.parcel-events.dlq', 'dlq'],
        ['webhooks.parcel-events', 'work'],
        ['webhooks.parcel-events.dlq', 'dlq'],
      ]);
      for (const q of res.body) {
        expect(Number.isInteger(q.messages)).toBe(true);
        expect(Number.isInteger(q.consumers)).toBe(true);
      }
      await broker.onModuleDestroy();
    });
  });

  describe('GET /admin/ops/webhook-attempts', () => {
    it('lists attempts newest-first, paginated, and filters by status', async () => {
      const dead = await newAttempt('DEAD');
      await newAttempt('SUCCEEDED');
      const cookie = await t.cookieFor('ADMIN');

      const res = await request(t.http)
        .get('/api/v1/admin/ops/webhook-attempts?status=DEAD&pageSize=100')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 100 });
      expect(res.body.data.every((a: { status: string }) => a.status === 'DEAD')).toBe(true);
      const row = res.body.data.find((a: { id: string }) => a.id === dead.id);
      expect(row).toMatchObject({
        endpointId,
        endpointUrl: 'http://127.0.0.1:1/hook',
        status: 'DEAD',
        responseStatus: 503,
      });
      expect(JSON.stringify(row)).not.toContain('not-a-real-secret');
    });

    it('rejects an unknown status filter with 400', async () => {
      await request(t.http)
        .get('/api/v1/admin/ops/webhook-attempts?status=BOGUS')
        .set('Cookie', await t.cookieFor('ADMIN'))
        .expect(400);
    });
  });

  describe('POST /admin/ops/webhook-attempts/:id/retry', () => {
    it('queues a DEAD attempt for re-delivery and writes an audit entry', async () => {
      const attempt = await newAttempt('DEAD', await newOutboxEvent());
      const admin = await t.prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });

      const res = await request(t.http)
        .post(`/api/v1/admin/ops/webhook-attempts/${attempt.id}/retry`)
        .set('Cookie', await t.cookieFor('ADMIN'))
        .expect(202);

      expect(res.body).toEqual({ queued: true });
      const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { entityId: attempt.id } });
      expect(audit).toMatchObject({
        action: 'webhook_attempt.retried',
        entityType: 'WebhookAttempt',
        actorId: admin.id,
      });
      expect(audit.metadata).toEqual({ endpointId, eventId: attempt.eventId });
    });

    it('returns 404 for an unknown attempt', async () => {
      await request(t.http)
        .post('/api/v1/admin/ops/webhook-attempts/does-not-exist/retry')
        .set('Cookie', await t.cookieFor('ADMIN'))
        .expect(404);
    });

    it('returns 409 for an attempt that already succeeded', async () => {
      const attempt = await newAttempt('SUCCEEDED', await newOutboxEvent());
      await request(t.http)
        .post(`/api/v1/admin/ops/webhook-attempts/${attempt.id}/retry`)
        .set('Cookie', await t.cookieFor('ADMIN'))
        .expect(409);
    });

    it('returns 409 when the event was meanwhile delivered to the endpoint', async () => {
      const eventId = await newOutboxEvent();
      const dead = await newAttempt('DEAD', eventId);
      await t.prisma.webhookAttempt.create({
        data: { endpointId, eventId, attemptNumber: 2, status: 'SUCCEEDED', responseStatus: 200 },
      });
      await request(t.http)
        .post(`/api/v1/admin/ops/webhook-attempts/${dead.id}/retry`)
        .set('Cookie', await t.cookieFor('ADMIN'))
        .expect(409);
    });

    it('returns 404 when the original event is no longer in the outbox', async () => {
      const attempt = await newAttempt('DEAD', randomUUID());
      await request(t.http)
        .post(`/api/v1/admin/ops/webhook-attempts/${attempt.id}/retry`)
        .set('Cookie', await t.cookieFor('ADMIN'))
        .expect(404);
    });
  });
});
