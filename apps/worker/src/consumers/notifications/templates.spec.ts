import type { DomainEvent } from '@swiftdrop/contracts';
import { humanizeReason, renderNotification } from './templates';

const parcel = { trackingNumber: 'SD123456789', dropoffCity: 'Kandy' };
const base = {
  eventId: '6c0e2f9e-7a43-4b7e-9d0c-1f1d8a8a3b21',
  eventVersion: 1 as const,
  occurredAt: '2026-11-03T09:15:22.000Z',
  correlationId: 'c1',
};
const statusEvent = (newStatus: string, failureReason?: string) =>
  ({
    ...base,
    eventType: 'parcel.status_changed',
    data: {
      parcelId: 'p1',
      trackingNumber: 'SD123456789',
      merchantId: null,
      customerId: null,
      previousStatus: null,
      newStatus,
      actorRole: 'COURIER',
      failureReason,
    },
  }) as DomainEvent;
const render = (e: DomainEvent) => renderNotification(e, parcel, 'http://localhost:8080/');

describe('renderNotification', () => {
  it('renders the booking confirmation for parcel.created', () => {
    const msg = render({
      ...base,
      eventType: 'parcel.created',
      data: { parcelId: 'p1', trackingNumber: 'SD123456789', merchantId: null, customerId: null },
    });
    expect(msg?.template).toBe('booking_confirmation');
    expect(msg?.subject).toContain('SD123456789');
    expect(msg?.text).toContain('Kandy');
    expect(msg?.text).toContain('http://localhost:8080/track/SD123456789');
  });

  it.each([
    ['OUT_FOR_DELIVERY', 'out_for_delivery'],
    ['DELIVERED', 'delivered'],
    ['FAILED', 'delivery_failed'],
  ])('renders %s as %s', (status, template) => {
    const msg = render(statusEvent(status));
    expect(msg?.template).toBe(template);
    expect(msg?.subject).toContain('SD123456789');
    expect(msg?.sms.length).toBeGreaterThan(0);
  });

  it('includes a readable failure reason', () => {
    expect(render(statusEvent('FAILED', 'RECIPIENT_UNAVAILABLE'))?.text).toContain(
      'the recipient was not available',
    );
  });

  it('does not notify for intermediate statuses or courier assignment', () => {
    expect(render(statusEvent('PICKED_UP'))).toBeNull();
    expect(render(statusEvent('IN_TRANSIT'))).toBeNull();
    expect(
      render({
        ...base,
        eventType: 'parcel.courier_assigned',
        data: { parcelId: 'p1', trackingNumber: 'SD123456789', courierId: 'c', assignedById: 'd' },
      }),
    ).toBeNull();
  });

  it('humanizes unknown reason codes', () => {
    expect(humanizeReason('WEATHER_DELAY')).toBe('weather delay');
    expect(humanizeReason(null)).toBeNull();
  });
});
