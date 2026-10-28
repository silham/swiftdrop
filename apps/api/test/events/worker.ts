/**
 * Shared helpers for the event-pipeline integration tests (M8).
 *
 * The worker lives in another package, and apps/api/tsconfig.json has rootDir = apps/api, so the
 * worker sources cannot be imported statically (TS6059). They are loaded at runtime instead (jest's
 * swc transform compiles them) and typed with the minimal shapes the tests use.
 */
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@swiftdrop/db';

export interface WorkerConfig {
  DATABASE_URL: string;
  RABBITMQ_URL: string;
  OUTBOX_BATCH_SIZE: number;
  WEBHOOK_TIMEOUT_MS: number;
  WEBHOOK_RETRY_DELAYS_MS: number[];
  WEBHOOK_SECRET_ENC_KEY: string;
  APP_URL: string;
}

export interface ConsumeContext {
  attempt: number;
  lastAttempt: boolean;
}
export type PrismaService = PrismaClient & { onModuleDestroy(): Promise<void> };
export interface RabbitMqService {
  onModuleInit(): void;
  onModuleDestroy(): Promise<void>;
  isConnected(): boolean;
  consume(
    queue: string,
    handler: (payload: unknown, msg: unknown, ctx: ConsumeContext) => Promise<void>,
    prefetch?: number,
  ): Promise<void>;
}
export interface OutboxRelayService {
  relayOnce(): Promise<number>;
  purgePublished(now?: Date): Promise<number>;
}
export interface WebhooksConsumer {
  handle(payload: unknown, ctx?: ConsumeContext, targetEndpointId?: string): Promise<void>;
}
export interface NotificationsConsumer {
  handle(payload: unknown): Promise<void>;
}
export interface FakeMail {
  sendEmail: jest.Mock;
  sendSms: jest.Mock;
}

/* eslint-disable @typescript-eslint/no-require-imports */
export const worker = {
  PrismaService: require('../../../worker/src/infra/prisma.service').PrismaService as new (
    c: WorkerConfig,
  ) => PrismaService,
  RabbitMqService: require('../../../worker/src/infra/rabbitmq.service').RabbitMqService as new (
    c: WorkerConfig,
  ) => RabbitMqService,
  OutboxRelayService: require('../../../worker/src/outbox-relay/outbox-relay.service')
    .OutboxRelayService as new (
    c: WorkerConfig,
    p: PrismaService,
    r: unknown,
  ) => OutboxRelayService,
  WebhooksConsumer: require('../../../worker/src/consumers/webhooks/webhooks.consumer')
    .WebhooksConsumer as new (c: WorkerConfig, r: unknown, p: PrismaService) => WebhooksConsumer,
  NotificationsConsumer:
    require('../../../worker/src/consumers/notifications/notifications.consumer')
      .NotificationsConsumer as new (
      c: WorkerConfig,
      r: unknown,
      p: PrismaService,
      m: FakeMail,
    ) => NotificationsConsumer,
  TransientError: require('../../../worker/src/infra/retry').TransientError as new (
    message: string,
  ) => Error,
  encryptSecret: require('../../../worker/src/consumers/webhooks/secret-crypto').encryptSecret as (
    secret: string,
    base64Key: string,
  ) => string,
  verifySignature: require('../../../worker/src/consumers/webhooks/signature').verifySignature as (
    secrets: string[],
    rawBody: string,
    header: string,
  ) => boolean,
};
/* eslint-enable @typescript-eslint/no-require-imports */

export const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://swiftdrop:swiftdrop@localhost:5672';

export function workerConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    RABBITMQ_URL,
    OUTBOX_BATCH_SIZE: 50,
    WEBHOOK_TIMEOUT_MS: 2_000,
    WEBHOOK_RETRY_DELAYS_MS: [10_000, 60_000, 300_000],
    WEBHOOK_SECRET_ENC_KEY: randomBytes(32).toString('base64'),
    APP_URL: 'http://localhost:8080',
    ...overrides,
  };
}

export async function until(check: () => boolean | Promise<boolean>, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 50));
  }
}

export interface CapturedRequest {
  headers: IncomingHttpHeaders;
  body: string;
}

/** Local HTTP server standing in for a merchant endpoint. `respond.status` can change per test. */
export async function startEndpointServer() {
  const requests: CapturedRequest[] = [];
  const respond = { status: 200 };
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      requests.push({ headers: req.headers, body: Buffer.concat(chunks).toString() });
      res.statusCode = respond.status;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    requests,
    respond,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A URL on a port nothing listens on (connection refused). */
export async function closedPortUrl(): Promise<string> {
  const server = await startEndpointServer();
  const url = server.url;
  await server.close();
  return url;
}
