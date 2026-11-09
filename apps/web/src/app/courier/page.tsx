import { Alert, PageHeader } from '@/components/ui';
import {
  CourierEmptyState,
  CourierHowItWorks,
  CourierTodaySummary,
  DeliveryCard,
} from '@/features/courier';
import { errorMessage } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';
import { formatDateTime } from '@/lib/format';

export const metadata = { title: 'My deliveries' };

function isToday(value: string | null | undefined) {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

/** Owner: M6. Assigned deliveries as large touch cards, plus today's counts. */
export default async function CourierPage() {
  const api = await serverApi();
  const [assigned, history] = await Promise.all([
    api.GET('/api/v1/courier/parcels'),
    api.GET('/api/v1/courier/history', { params: { query: { pageSize: 50 } } }),
  ]);

  const assignedError: unknown = assigned.error;
  const parcels = assigned.data ?? [];
  const deliveredToday =
    history.data?.data.filter((h) => h.status === 'DELIVERED' && isToday(h.deliveredAt)).length ??
    null;

  return (
    <div className="space-y-6">
      <PageHeader title="My deliveries" description="Parcels assigned to you" eyebrow="Today" />
      <CourierTodaySummary
        assigned={assigned.data ? parcels.length : null}
        outForDelivery={
          assigned.data ? parcels.filter((p) => p.status === 'OUT_FOR_DELIVERY').length : null
        }
        deliveredToday={deliveredToday}
      />
      <section aria-labelledby="assigned-heading" className="space-y-3">
        <h2 id="assigned-heading" className="text-sm font-semibold text-ink">
          Assigned to you
        </h2>
        {!assigned.data ? (
          <Alert tone="error">
            {errorMessage(assignedError, 'Unable to load your deliveries')}
          </Alert>
        ) : parcels.length === 0 ? (
          <CourierEmptyState />
        ) : (
          <ul className="space-y-3">
            {parcels.map((p) => (
              <li key={p.id}>
                <DeliveryCard
                  href={`/courier/parcels/${encodeURIComponent(p.id)}`}
                  trackingNumber={p.trackingNumber}
                  status={p.status}
                  recipientName={p.recipientName}
                  address={p.dropoffAddress}
                  city={p.dropoffCity}
                  meta={`Assigned ${formatDateTime(p.assignedAt)} · ${p.weightKg} kg`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      {parcels.length === 0 && assigned.data && (
        <section aria-labelledby="how-heading" className="space-y-3">
          <h2 id="how-heading" className="text-sm font-semibold text-ink">
            How it works
          </h2>
          <CourierHowItWorks />
        </section>
      )}
    </div>
  );
}
