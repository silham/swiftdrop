import { PageHeader } from '@/components/ui';
import { WebhooksManager } from '@/features/merchant/WebhooksManager';

export const metadata = { title: 'Webhooks' };

/**
 * Owner: M5 — Merchant webhook configuration, signing secrets, and delivery attempts.
 */
export default async function MerchantWebhooksPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={'Webhooks'}
        description="Endpoints, HMAC signing secrets and delivery attempts for automated order updates."
      />
      <WebhooksManager />
    </div>
  );
}
