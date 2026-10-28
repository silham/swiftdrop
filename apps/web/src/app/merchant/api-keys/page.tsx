import { PageHeader } from '@/components/ui';
import { ApiKeysManager } from '@/features/merchant/ApiKeysManager';

export const metadata = { title: 'API keys' };

/**
 * Owner: M5 — Merchant partner API keys management.
 */
export default async function MerchantApiKeysPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={'API keys'}
        description="Create, view and revoke partner API keys. Raw keys are shown only once at creation."
      />
      <ApiKeysManager />
    </div>
  );
}
