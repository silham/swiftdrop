import { PageHeader } from '@/components/ui';
import {
  MerchantDashboardView,
  type IntegrationSummary,
} from '@/features/merchant/MerchantDashboardView';
import { errorMessage } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';

export const metadata = { title: 'Merchant dashboard' };

/**
 * Owner: M5 — Merchant dashboard with approval-status banner and order metrics.
 */
export default async function MerchantPage() {
  const api = await serverApi();

  const [meRes, statsRes, parcelsRes, keysRes, webhooksRes] = await Promise.all([
    api.GET('/api/v1/merchants/me'),
    api.GET('/api/v1/merchants/me/stats'),
    api.GET('/api/v1/merchants/me/parcels' as any, {
      params: { query: { pageSize: 5 } },
    }),
    api.GET('/api/v1/merchants/me/api-keys'),
    api.GET('/api/v1/merchants/me/webhooks'),
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

  // Each widget gets its own error so one failing request doesn't blank the dashboard.
  const keys = keysRes.data;
  const hooks = webhooksRes.data;
  const integration: IntegrationSummary = {
    apiKeys: keys
      ? {
          active: keys.filter((k) => !k.revokedAt).length,
          revoked: keys.filter((k) => k.revokedAt).length,
          lastUsedAt:
            keys
              .map((k) => k.lastUsedAt as string | null | undefined)
              .filter((d): d is string => !!d)
              .sort()
              .at(-1) ?? null,
        }
      : undefined,
    webhooks: hooks
      ? {
          active: hooks.filter((h) => h.isActive).length,
          inactive: hooks.filter((h) => !h.isActive).length,
        }
      : undefined,
    apiKeysError: keys
      ? undefined
      : errorMessage((keysRes as { error?: unknown }).error, 'Could not load API keys'),
    webhooksError: hooks
      ? undefined
      : errorMessage((webhooksRes as { error?: unknown }).error, 'Could not load webhooks'),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Merchant portal"
        title={merchant.businessName || 'Merchant Dashboard'}
        description={`Status: ${merchant.status} · Contact: ${merchant.contactEmail}`}
      />
      <MerchantDashboardView
        merchant={merchant as any}
        stats={stats as any}
        recentOrders={recentOrders}
        integration={integration}
      />
    </div>
  );
}
