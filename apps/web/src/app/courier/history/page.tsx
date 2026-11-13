import { Alert, PageHeader } from '@/components/ui';
import { CourierEmptyState, DeliveryCard, HistoryPagination } from '@/features/courier';
import { errorMessage } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';
import { formatDateTime } from '@/lib/format';

export const metadata = { title: 'History' };

const PAGE_SIZE = 20;

/** Owner: M6. Finished deliveries (delivered, or failed on the last attempt), newest first. */
export default async function CourierHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);

  const api = await serverApi();
  const { data, error } = await api.GET('/api/v1/courier/history', {
    params: { query: { page, pageSize: PAGE_SIZE } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="History" description="Completed and failed deliveries" />
      {error ? (
        <Alert tone="error">{errorMessage(error, 'Unable to load your history')}</Alert>
      ) : !data || data.data.length === 0 ? (
        <CourierEmptyState
          title="No completed deliveries yet"
          description="Delivered and failed parcels show up here after you complete them."
        />
      ) : (
        <>
          <ul className="space-y-3">
            {data.data.map((h) => (
              <li key={h.assignmentId}>
                <DeliveryCard
                  href={`/courier/parcels/${encodeURIComponent(h.parcelId)}`}
                  trackingNumber={h.trackingNumber}
                  status={h.status}
                  recipientName={h.recipientName}
                  address={h.dropoffAddress}
                  city={h.dropoffCity}
                  meta={h.completedAt ? `Completed ${formatDateTime(h.completedAt)}` : undefined}
                />
              </li>
            ))}
          </ul>
          <HistoryPagination
            page={data.meta.page}
            pageSize={data.meta.pageSize}
            total={data.meta.total}
          />
        </>
      )}
    </div>
  );
}
