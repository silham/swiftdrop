import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { domainEvent, QUEUES } from '@swiftdrop/contracts';
import type { NotificationChannel } from '@swiftdrop/db';
import { InjectConfig, type WorkerEnv } from '../../config/config.module';
import { isProcessed, markProcessed } from '../../infra/idempotency';
import { PrismaService } from '../../infra/prisma.service';
import { RabbitMqService } from '../../infra/rabbitmq.service';
import { TransientError } from '../../infra/retry';
import { maskEmail, maskPhone } from './mask';
import { MailProvider } from './mail.provider';
import { renderNotification, type RenderedMessage } from './templates';

export const NOTIFICATIONS_CONSUMER = 'notifications';

interface Target {
  channel: NotificationChannel;
  /** Masked form: what is stored in NotificationLog.recipient and written to logs. */
  masked: string;
  send: (message: RenderedMessage) => Promise<void>;
}

/**
 * Consumes parcel events → emails the customer and the recipient and sends a mock SMS to the
 * recipient's phone. Owner: M8.
 *
 *  1. validate with `domainEvent` (invalid → dead-letter) and skip events already fully processed
 *  2. load the parcel (+ customer) by id: contact details come from the DB, never from the event
 *  3. per target, skip it if a SENT NotificationLog exists (unique `(eventId, channel, recipient)`
 *     is the second idempotency guard), otherwise send and upsert the log
 *  4. a provider error is transient: the failed target is logged FAILED and the event is retried;
 *     targets that already went out are not sent again. `markProcessed` is written only once every
 *     target succeeded.
 */
@Injectable()
export class NotificationsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsConsumer.name);

  constructor(
    @InjectConfig() private readonly config: WorkerEnv,
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
    private readonly mail: MailProvider,
  ) {}

  async onApplicationBootstrap() {
    await this.rabbit.consume(QUEUES.NOTIFICATIONS, (payload) => this.handle(payload));
  }

  async handle(payload: unknown): Promise<void> {
    const parsed = domainEvent.safeParse(payload);
    if (!parsed.success) throw new Error('invalid event payload'); // permanent → dead-letter
    const event = parsed.data;

    if (await isProcessed(this.prisma, NOTIFICATIONS_CONSUMER, event.eventId)) return;

    const parcel = await this.prisma.parcel.findUnique({
      where: { id: event.data.parcelId },
      select: {
        trackingNumber: true,
        dropoffCity: true,
        recipientName: true,
        recipientPhone: true,
        recipientEmail: true,
        customer: { select: { email: true, name: true } },
      },
    });
    if (!parcel) {
      this.logger.warn(`event ${event.eventId}: parcel not found, nothing to notify`);
      return;
    }

    const message = renderNotification(event, parcel, this.config.APP_URL);
    if (!message) {
      await markProcessed(this.prisma, NOTIFICATIONS_CONSUMER, event.eventId);
      return;
    }

    const targets = this.targetsFor(parcel);
    let failed = 0;
    for (const target of targets) {
      if (!(await this.notify(event.eventId, message, target))) failed++;
    }
    if (failed > 0) {
      throw new TransientError(`${failed} notification(s) for event ${event.eventId} failed`);
    }
    await markProcessed(this.prisma, NOTIFICATIONS_CONSUMER, event.eventId);
  }

  private targetsFor(parcel: {
    recipientPhone: string;
    recipientEmail: string | null;
    customer: { email: string } | null;
  }): Target[] {
    const targets: Target[] = [];
    const emailed = new Set<string>();
    // The role prefix keeps the idempotency key unique per target: two different addresses can
    // mask to the same string (johnsmith@ and jacobsmith@ → j******h@), and the second would be skipped.
    for (const [role, address] of [
      ['customer', parcel.customer?.email],
      ['recipient', parcel.recipientEmail],
    ] as const) {
      if (!address || emailed.has(address.toLowerCase())) continue;
      emailed.add(address.toLowerCase());
      targets.push({
        channel: 'EMAIL',
        masked: `${role}:${maskEmail(address)}`,
        send: (m) => this.mail.sendEmail(address, m.subject, m.text),
      });
    }
    targets.push({
      channel: 'SMS',
      masked: `recipient:${maskPhone(parcel.recipientPhone)}`,
      send: (m) => this.mail.sendSms(parcel.recipientPhone, m.sms),
    });
    return targets;
  }

  /** Returns true when the target was (or already had been) notified. */
  private async notify(
    eventId: string,
    message: RenderedMessage,
    target: Target,
  ): Promise<boolean> {
    const key = { eventId, channel: target.channel, recipient: target.masked };
    const existing = await this.prisma.notificationLog.findUnique({
      where: { eventId_channel_recipient: key },
    });
    if (existing?.status === 'SENT') return true;

    let error: string | null = null;
    try {
      await target.send(message);
    } catch (err) {
      // Provider messages can echo the address, so only a code is kept.
      error = String((err as { code?: string }).code ?? 'SEND_FAILED').slice(0, 100);
      this.logger.warn(`event ${eventId}: ${target.channel} to ${target.masked} failed (${error})`);
    }

    const status = error ? 'FAILED' : 'SENT';
    await this.prisma.notificationLog.upsert({
      where: { eventId_channel_recipient: key },
      create: { ...key, template: message.template, status, error },
      update: { template: message.template, status, error },
    });
    return !error;
  }
}
