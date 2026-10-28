import { PageHeader } from '@/components/ui';
import { MerchantOrdersView } from '@/features/merchant/MerchantOrdersView';

export const metadata = { title: 'Orders' };

/**
 * Owner: M5 — Merchant orders created via the partner API.
 */
export default async function MerchantOrdersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={'Orders'}
        description="View and filter all parcels submitted through your partner API."
      />
      <MerchantOrdersView />
    </div>
  );
}
