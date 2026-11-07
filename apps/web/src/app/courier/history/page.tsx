import { PageHeader } from '@/components/ui';
import { CourierEmptyState } from '@/features/courier';

export const metadata = { title: 'History' };

/**
 * Owner: M6. TODO(M6): GET /api/v1/courier/history — list with <DeliveryCard> (DELIVERED / FAILED).
 * Components live in src/features/courier/.
 */
export default async function CourierHistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader title={'History'} description="Completed and failed deliveries" />
      <CourierEmptyState
        title="No completed deliveries yet"
        description="Delivered and failed parcels show up here after you complete them."
      />
    </div>
  );
}
