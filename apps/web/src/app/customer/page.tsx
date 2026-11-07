import { PARCEL_STATUSES, type ParcelStatus } from '@swiftdrop/contracts';
import { redirect } from 'next/navigation';
import { Alert, PageHeader } from '@/components/ui';
import {
  BookingLink,
  DeliveriesDashboard,
  type DeliverySummary,
} from '@/features/booking/DeliveriesDashboard';
import { errorMessage } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';

export const metadata = { title: 'My deliveries' };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parcelStatus(value: string | undefined): ParcelStatus | undefined {
  return PARCEL_STATUSES.find((status) => status === value);
}

export default async function CustomerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const page = positiveInteger(first(query.page), 1);
  const status = parcelStatus(first(query.status));
  const api = await serverApi();
  // List + KPI counts in parallel. Counts read meta.total from 1-row pages; each falls back to null.
  const count = (s?: ParcelStatus) =>
    api
      .GET('/api/v1/parcels/mine', { params: { query: { page: 1, pageSize: 1, status: s } } })
      .then((r) => r.data?.meta.total ?? null)
      .catch(() => null);
  const [{ data, error }, total, delivered, failed] = await Promise.all([
    api.GET('/api/v1/parcels/mine', { params: { query: { page, pageSize: 20, status } } }),
    count(),
    count('DELIVERED'),
    count('FAILED'),
  ]);
  const summary: DeliverySummary = { total, delivered, failed };

  if (data && data.meta.total > 0 && data.data.length === 0) {
    const lastPage = Math.ceil(data.meta.total / data.meta.pageSize);
    if (page > lastPage) {
      const params = new URLSearchParams({ page: String(lastPage) });
      if (status) params.set('status', status);
      redirect(`/customer?${params.toString()}`);
    }
  }

  return (
    <>
      <PageHeader
        title="My deliveries"
        description="Your bookings and their current status"
        eyebrow="Customer"
        actions={<BookingLink compact />}
      />
      {data ? (
        <DeliveriesDashboard result={data} status={status} summary={summary} />
      ) : (
        <Alert tone="error">{errorMessage(error, 'Unable to load your deliveries')}</Alert>
      )}
    </>
  );
}
