/**
 * Dev helper for demos and manual review (M8). The parcel-lifecycle API is built by other members,
 * so this writes what `ParcelsService.transition` will write: a parcel row plus an outbox event.
 * The running worker's relay then publishes it, the notifications consumer emails Mailpit and the
 * webhooks consumer calls the demo merchant's endpoint.
 *
 *   docker compose exec api pnpm exec tsx ../worker/scripts/demo-event.ts \
 *       [--url http://api:4200/hook] [--status DELIVERED] [--event status|created]
 *
 * It (re)creates ONE webhook endpoint for the demo merchant (secret "whsec_demo") pointing at
 * --url, and inserts a fresh parcel for customer@swiftdrop.test.
 */
/* eslint-disable no-console */
import { randomUUID } from 'node:crypto';
import { domainEvent, routingKey } from '@swiftdrop/contracts';
import { createPrismaClient, type Prisma } from '@swiftdrop/db';
import { encryptSecret } from '../src/consumers/webhooks/secret-crypto';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main() {
  const url = arg('url', 'http://api:4200/hook');
  const newStatus = arg('status', 'DELIVERED');
  const kind = arg('event', 'status');
  const encKey = process.env.WEBHOOK_SECRET_ENC_KEY;
  if (!process.env.DATABASE_URL || !encKey)
    throw new Error('DATABASE_URL / WEBHOOK_SECRET_ENC_KEY missing');

  const prisma = createPrismaClient(process.env.DATABASE_URL);
  try {
    const customer = await prisma.user.findUniqueOrThrow({
      where: { email: 'customer@swiftdrop.test' },
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: 'merchant@swiftdrop.test' },
    });
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { ownerUserId: owner.id } });

    await prisma.webhookEndpoint.deleteMany({ where: { merchantId: merchant.id, url } });
    await prisma.webhookEndpoint.create({
      data: {
        merchantId: merchant.id,
        url,
        secretEncrypted: encryptSecret('whsec_demo', encKey),
        eventTypes: ['parcel.created', 'parcel.status_changed'],
      },
    });

    const trackingNumber = `SD9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const parcel = await prisma.parcel.create({
      data: {
        trackingNumber,
        customerId: customer.id,
        merchantId: merchant.id,
        source: 'MERCHANT_API',
        senderName: 'Lanka Books (Demo)',
        senderPhone: '+94112345678',
        pickupAddress: '12 Galle Road',
        pickupCity: 'colombo',
        recipientName: 'Demo Recipient',
        recipientPhone: '+94771234567',
        recipientEmail: 'recipient@example.test',
        dropoffAddress: '5 Temple Street',
        dropoffCity: 'kandy',
        size: 'SMALL',
        weightKg: 1,
        feeCents: 45000,
      },
    });

    const base = {
      eventId: randomUUID(),
      eventVersion: 1 as const,
      occurredAt: new Date().toISOString(),
      correlationId: `demo-${randomUUID()}`,
    };
    const event = domainEvent.parse(
      kind === 'created'
        ? {
            ...base,
            eventType: 'parcel.created',
            data: {
              parcelId: parcel.id,
              trackingNumber,
              merchantId: merchant.id,
              customerId: customer.id,
            },
          }
        : {
            ...base,
            eventType: 'parcel.status_changed',
            data: {
              parcelId: parcel.id,
              trackingNumber,
              merchantId: merchant.id,
              customerId: customer.id,
              previousStatus: 'OUT_FOR_DELIVERY',
              newStatus,
              actorRole: 'COURIER',
              ...(newStatus === 'FAILED' ? { failureReason: 'RECIPIENT_UNAVAILABLE' } : {}),
            },
          },
    );
    await prisma.outboxEvent.create({
      data: {
        id: event.eventId,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        routingKey: routingKey(event.eventType, event.eventVersion),
        payload: event as unknown as Prisma.InputJsonValue,
        correlationId: event.correlationId,
      },
    });
    console.log(`queued ${event.eventType} for ${trackingNumber} (event ${event.eventId})`);
    console.log(`webhook endpoint: ${url}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
