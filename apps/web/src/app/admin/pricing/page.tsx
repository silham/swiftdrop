import { PageHeader } from '@/components/ui';
import { EstimatePreview, PricingRulesManagement } from '@/features/pricing';

export const metadata = { title: 'Pricing rules' };

/**
 * Owner: M7 — Delivery pricing rules configuration and live estimate preview.
 */
export default async function AdminPricingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery Pricing Rules"
        eyebrow="Configuration"
        description="Configure base fees, per-kg rates, and route-specific pricing tiers."
      />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PricingRulesManagement />
        </div>
        <EstimatePreview />
      </div>
    </div>
  );
}
