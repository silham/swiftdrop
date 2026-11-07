import { PageHeader } from '@/components/ui';
import { AdminOverviewDashboard } from '@/features/reports';
import { fetchOverview } from '@/features/reports/overview-data';
import { serverApi } from '@/lib/api/server';
import { requireRole } from '@/lib/auth/session';

export const metadata = { title: 'Admin Overview' };

/** Owner: M9. Admin landing dashboard: delivery KPIs, trends, couriers, pipeline health, audit. */
export default async function AdminPage() {
  await requireRole(['ADMIN']);
  const { data, errors } = await fetchOverview(await serverApi());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Overview"
        description="Monitor parcel delivery operations and performance."
      />
      <AdminOverviewDashboard initialData={data} initialErrors={errors} />
    </div>
  );
}
