import type { DomainEvent } from '@swiftdrop/contracts';

/** Minimal parcel data a message needs; contact details are loaded from the DB, never from events. */
export interface TemplateParcel {
  trackingNumber: string;
  dropoffCity: string;
}

export interface RenderedMessage {
  /** Stable template id, stored in NotificationLog.template. */
  template: 'booking_confirmation' | 'out_for_delivery' | 'delivered' | 'delivery_failed';
  subject: string;
  /** Email body. */
  text: string;
  /** Short body for SMS. */
  sms: string;
}

const FAILURE_REASONS: Record<string, string> = {
  RECIPIENT_UNAVAILABLE: 'the recipient was not available',
  ADDRESS_NOT_FOUND: 'the address could not be found',
  REFUSED: 'the parcel was refused',
};

export function humanizeReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return FAILURE_REASONS[reason] ?? reason.toLowerCase().replace(/_/g, ' ');
}

/**
 * Message for an event, or null when the event does not notify anyone (e.g. PICKED_UP, IN_TRANSIT,
 * courier assignment). Pure: no I/O, easy to unit test.
 */
export function renderNotification(
  event: DomainEvent,
  parcel: TemplateParcel,
  appUrl: string,
): RenderedMessage | null {
  const tn = parcel.trackingNumber;
  const link = `${appUrl.replace(/\/$/, '')}/track/${tn}`;

  if (event.eventType === 'parcel.created') {
    return {
      template: 'booking_confirmation',
      subject: `SwiftDrop booking confirmed: ${tn}`,
      text: `Your parcel ${tn} has been booked for delivery to ${parcel.dropoffCity}.\nTrack it here: ${link}`,
      sms: `SwiftDrop: parcel ${tn} booked. Track: ${link}`,
    };
  }

  if (event.eventType === 'parcel.status_changed') {
    switch (event.data.newStatus) {
      case 'OUT_FOR_DELIVERY':
        return {
          template: 'out_for_delivery',
          subject: `Your parcel ${tn} is out for delivery`,
          text: `Your parcel ${tn} is out for delivery today.\nTrack it here: ${link}`,
          sms: `SwiftDrop: parcel ${tn} is out for delivery. Track: ${link}`,
        };
      case 'DELIVERED':
        return {
          template: 'delivered',
          subject: `Your parcel ${tn} was delivered`,
          text: `Your parcel ${tn} has been delivered.\nDetails: ${link}`,
          sms: `SwiftDrop: parcel ${tn} was delivered.`,
        };
      case 'FAILED': {
        const reason = humanizeReason(event.data.failureReason);
        return {
          template: 'delivery_failed',
          subject: `Delivery attempt failed for parcel ${tn}`,
          text: `We could not deliver your parcel ${tn}${reason ? ` because ${reason}` : ''}.\nTrack it here: ${link}`,
          sms: `SwiftDrop: delivery of parcel ${tn} failed${reason ? ` (${reason})` : ''}. Track: ${link}`,
        };
      }
    }
  }
  return null;
}
