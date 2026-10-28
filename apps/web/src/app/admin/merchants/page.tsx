import { PageHeader } from '@/components/ui';
import { AdminMerchantsView } from '@/features/merchant/AdminMerchantsView';
import { requireRole } from '@/lib/auth/session';

export const metadata = { title: 'Merchants' };

/**
 * Owner: M5 — Admin merchant approval and status management.
 */
export default async function AdminMerchantsPage() {
  await requireRole(['ADMIN']);
  return (
    <div className="space-y-6">
      <PageHeader
        title={'Merchants'}
        description="Review partner merchant registrations, approve accounts, or suspend access."
      />
      <AdminMerchantsView />
    </div>
  );
}
