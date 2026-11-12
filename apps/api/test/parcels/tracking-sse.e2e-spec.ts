import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Parcel } from '@swiftdrop/db';
import { RabbitMqService as ApiRabbitMqService } from '../../src/infra/events';
import { ParcelsService } from '../../src/modules/parcels';
import {
  until,
  worker,
  workerConfig,
  type OutboxRelayService,
  type PrismaService,
  type RabbitMqService as WorkerRabbitMqService,
} from '../events/worker';
import { createTestApp, type TestContext } from '../utils/app';

const SYSTEM = { id: null, role: 'SYSTEM' } as const;

/** One open SSE connection. `text` grows as chunks arrive. */
interface SseClient {
  status: number;
  contentType: string;
  text: () => string;
  close: () => void;
}

function openSse(port: number, trackingNumber: string): Promise<SseClient> {
  return new Promise((resolve, reject) => {
    let text = '';
    const req = http.get(
      {
        port,
        path: `/api/v1/tracking/${trackingNumber}/events`,
        headers: { Accept: 'text/event-stream' },
      },
      (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        resolve({
          status: res.statusCode ?? 0,
          contentType: String(res.headers['content-type'] ?? ''),
          text: () => text,
          close: () => req.destroy(),
        });
      },
    );
    req.on('error', (err) => {
      // Closing the stream on purpose surfaces as ECONNRESET; only a failed connect matters.
      if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err);
    });
  });
}

/**
 * Live tracking end to end (ADR-0004): a status change is committed with its outbox row, the worker's
 * relay publishes it to RabbitMQ, the API's SSE queue receives it and the open browser stream gets
 * it. Needs RabbitMQ, like the other event tests (`make test-int`).
 */
describe('live tracking over SSE (integration)', () => {
  let t: TestContext;
  let port: number;
  let parcels: ParcelsService;
  let prisma: PrismaService;
  let rabbit: WorkerRabbitMqService;
  let relay: OutboxRelayService;
  const clients: SseClient[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen(0);
    port = (t.app.getHttpServer().address() as AddressInfo).port;
    parcels = t.app.get(ParcelsService);

    // The API's exclusive SSE queue is set up in the background once RabbitMQ is connected.
    const apiRabbit = t.app.get(ApiRabbitMqService);
    await until(() => apiRabbit.isConnected());
    await new Promise((r) => setTimeout(r, 1_000));

    const config = workerConfig();
    prisma = new worker.PrismaService(config);
    rabbit = new worker.RabbitMqService(config);
    rabbit.onModuleInit();
    await until(() => rabbit.isConnected());
    relay = new worker.OutboxRelayService(config, prisma, rabbit);
  });

  afterAll(async () => {
    clients.forEach((c) => c.close());
    await rabbit?.onModuleDestroy();
    await prisma?.onModuleDestroy();
    await t.close();
  });

  const newParcel = (): Promise<Parcel> =>
    parcels.create(
      {
        source: 'CUSTOMER',
        senderName: 'SSE Sender',
        senderPhone: '+94770000001',
        pickupAddress: '1 Test Street',
        pickupCity: 'colombo',
        recipientName: 'SSE Recipient',
        recipientPhone: '+94770000002',
        dropoffAddress: '2 Test Road',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 1.5,
      },
      'CUSTOMER',
    );

  /** Relay until this parcel's status event has been published (other suites share the table). */
  async function relayStatusEventOf(parcel: Parcel) {
    await until(async () => {
      await relay.relayOnce();
      const row = await t.prisma.outboxEvent.findFirst({
        where: {
          eventType: 'parcel.status_changed',
          payload: { path: ['data', 'parcelId'], equals: parcel.id },
        },
      });
      return row?.publishedAt != null;
    }, 15_000);
  }

  it('pushes a status change to an open tracking stream', async () => {
    const parcel = await newParcel();
    const sse = await openSse(port, parcel.trackingNumber);
    clients.push(sse);
    expect(sse.status).toBe(200);
    expect(sse.contentType).toContain('text/event-stream');

    await parcels.transition(parcel.id, { to: 'PICKED_UP', actor: SYSTEM });
    await relayStatusEventOf(parcel);

    await until(() => sse.text().includes('event: status'), 15_000);
    const dataLine = sse
      .text()
      .split('\n')
      .find((line) => line.startsWith('data:') && line.includes(parcel.trackingNumber));
    const message = JSON.parse(dataLine!.slice('data:'.length));

    expect(message).toMatchObject({ trackingNumber: parcel.trackingNumber, status: 'PICKED_UP' });
    // Privacy: the public stream carries nothing but these three fields.
    expect(Object.keys(message).sort()).toEqual(['occurredAt', 'status', 'trackingNumber']);
  });

  it('keeps following the parcel through later changes', async () => {
    const parcel = await newParcel();
    const sse = await openSse(port, parcel.trackingNumber);
    clients.push(sse);

    await parcels.transition(parcel.id, { to: 'PICKED_UP', actor: SYSTEM });
    await parcels.transition(parcel.id, { to: 'IN_TRANSIT', actor: SYSTEM });
    await until(async () => {
      await relay.relayOnce();
      return sse.text().includes('"status":"IN_TRANSIT"');
    }, 15_000);

    expect(sse.text()).toContain('"status":"PICKED_UP"');
    // Order is kept: picked up arrives before in transit.
    expect(sse.text().indexOf('PICKED_UP')).toBeLessThan(sse.text().indexOf('IN_TRANSIT'));
  });

  it("does not leak one parcel's updates to another parcel's stream", async () => {
    const watched = await newParcel();
    const other = await newParcel();
    const sse = await openSse(port, watched.trackingNumber);
    clients.push(sse);

    await parcels.transition(other.id, { to: 'PICKED_UP', actor: SYSTEM });
    await relayStatusEventOf(other);
    // Give the broker a moment to deliver, then check nothing arrived for the other parcel.
    await new Promise((r) => setTimeout(r, 1_500));

    expect(sse.text()).not.toContain(other.trackingNumber);
    expect(sse.text()).not.toContain('event: status');
  });

  it('answers 404 for an unknown tracking number instead of opening a stream', async () => {
    const sse = await openSse(port, 'SD000000000');
    clients.push(sse);
    expect(sse.status).toBe(404);
  });
});
