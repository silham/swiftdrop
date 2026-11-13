import { MapPin, Phone } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  KeyValue,
  PageHeader,
  STATUS_LABEL,
  StatusBadge,
} from '@/components/ui';
import { CourierActions } from '@/features/courier';
import { errorCode, errorMessage } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';
import { formatDateTime } from '@/lib/format';

export const metadata = { title: 'Delivery' };

const mapsUrl = (address: string, city: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${city}, Sri Lanka`)}`;

/**
 * Owner: M6. One assigned delivery: contact + addresses, the status timeline and the actions the
 * API says are allowed next (status buttons, failure report, proof of delivery).
 */
export default async function CourierParcelsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  const { data: parcel, error } = await api.GET('/api/v1/courier/parcels/{id}', {
    params: { path: { id } },
  });

  if (errorCode(error) === 'NOT_FOUND') notFound();

  if (!parcel) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Delivery"
          breadcrumbs={[{ label: 'My deliveries', href: '/courier' }, { label: 'Delivery' }]}
        />
        <Alert tone="error">{errorMessage(error, 'Unable to load this delivery')}</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={parcel.trackingNumber}
        description={`${parcel.pickupCity} to ${parcel.dropoffCity}`}
        meta={<StatusBadge status={parcel.status} />}
        breadcrumbs={[
          { label: 'My deliveries', href: '/courier' },
          { label: parcel.trackingNumber },
        ]}
      />

      <Card flush>
        <CardHeader title="Deliver to" titleAs="h3" />
        <CardBody className="space-y-4">
          <KeyValue
            columns={2}
            items={[
              { label: 'Recipient', value: parcel.recipientName },
              {
                label: 'Phone',
                value: (
                  <a
                    href={`tel:${parcel.recipientPhone}`}
                    className="inline-flex items-center gap-1.5 font-medium text-brand hover:text-brand-hover"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {parcel.recipientPhone}
                  </a>
                ),
              },
              {
                label: 'Drop-off address',
                value: (
                  <a
                    href={mapsUrl(parcel.dropoffAddress, parcel.dropoffCity)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-start gap-1.5 font-medium text-brand hover:text-brand-hover"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {parcel.dropoffAddress},{' '}
                      <span className="capitalize">{parcel.dropoffCity}</span>
                    </span>
                  </a>
                ),
              },
              {
                label: 'Parcel',
                value: `${parcel.size.toLowerCase()} · ${parcel.weightKg} kg${
                  parcel.description ? ` · ${parcel.description}` : ''
                }`,
              },
              { label: 'Delivery attempts', value: parcel.deliveryAttempts },
            ]}
          />
        </CardBody>
      </Card>

      <Card flush>
        <CardHeader title="Pick up from" titleAs="h3" />
        <CardBody>
          <KeyValue
            columns={2}
            items={[
              { label: 'Sender', value: parcel.senderName },
              {
                label: 'Phone',
                value: (
                  <a
                    href={`tel:${parcel.senderPhone}`}
                    className="font-medium text-brand hover:text-brand-hover"
                  >
                    {parcel.senderPhone}
                  </a>
                ),
              },
              {
                label: 'Pickup address',
                value: (
                  <a
                    href={mapsUrl(parcel.pickupAddress, parcel.pickupCity)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-brand hover:text-brand-hover"
                  >
                    {parcel.pickupAddress}, <span className="capitalize">{parcel.pickupCity}</span>
                  </a>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card flush>
        <CardHeader title="Status timeline" titleAs="h3" />
        <CardBody>
          <ol className="space-y-3">
            {[...parcel.history].reverse().map((h) => (
              <li key={`${h.status}-${h.at}`} className="text-sm">
                <p className="font-medium text-ink">{STATUS_LABEL[h.status]}</p>
                <time className="text-muted" dateTime={h.at}>
                  {formatDateTime(h.at)}
                </time>
                {h.reason && (
                  <p className="text-danger">{h.reason.replaceAll('_', ' ').toLowerCase()}</p>
                )}
                {h.note && <p className="text-muted">{h.note}</p>}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <p className="text-sm text-muted">
        <Link href="/courier" className="font-medium text-brand hover:text-brand-hover">
          Back to my deliveries
        </Link>
      </p>

      <CourierActions
        parcelId={parcel.id}
        status={parcel.status}
        nextStatuses={parcel.nextStatuses}
        canDeliver={parcel.canDeliver}
        recipientName={parcel.recipientName}
      />
    </div>
  );
}
