import { PageHeader } from '@/components/ui';
import { MerchantDashboardView } from '@/features/merchant/MerchantDashboardView';
import { serverApi } from '@/lib/api/server';

export const metadata = { title: 'Merchant dashboard' };

/**
 * Owner: M5 — Merchant dashboard with approval-status banner and order metrics.
 */
export default async function MerchantPage() {
  const api = await serverApi();

  const [meRes, statsRes, parcelsRes] = await Promise.all([
    api.GET('/api/v1/merchants/me' as any),
    api.GET('/api/v1/merchants/me/stats' as any),
    api.GET('/api/v1/merchants/me/parcels' as any, {
      params: { query: { pageSize: 5 } },
    }),
  ]);

  const merchant = meRes.data ?? {
    id: '',
    businessName: 'My Merchant',
    contactEmail: '',
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  const stats = statsRes.data ?? {
    TOTAL: 0,
    CREATED: 0,
    PICKED_UP: 0,
    IN_TRANSIT: 0,
    OUT_FOR_DELIVERY: 0,
    DELIVERED: 0,
    FAILED: 0,
  };

  const recentOrders = (parcelsRes.data as any)?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={merchant.businessName || 'Merchant Dashboard'}
        description={`Status: ${merchant.status} · Contact: ${merchant.contactEmail}`}
      />
      <MerchantDashboardView
        merchant={merchant as any}
        stats={stats as any}
        recentOrders={recentOrders}
      />
    </div>
  );
}
