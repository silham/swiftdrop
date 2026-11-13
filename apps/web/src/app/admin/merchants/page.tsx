import { PageHeader } from '@/components/ui';
import { AdminMerchantsView } from '@/features/merchant/AdminMerchantsView';
import { requireRole } from '@/lib/auth/session';

export const metadata = { title: 'Merchants' };

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];

/**
 * Owner: M5 — Admin merchant approval and status management.
 * `?status=PENDING|APPROVED|REJECTED|SUSPENDED|ALL` preselects a tab (default PENDING).
 */
export default async function AdminMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(['ADMIN']);
  const { status } = await searchParams;
  const initialStatus =
    status === 'ALL' ? '' : status && STATUSES.includes(status) ? status : 'PENDING';
  return (
    <div className="space-y-6">
      <PageHeader
        title={'Merchants'}
        eyebrow="Accounts"
        description="Review partner merchant registrations, approve accounts, or suspend access."
      />
      <AdminMerchantsView initialStatus={initialStatus} />
    </div>
  );
}
