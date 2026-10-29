import { PageHeader } from '@/components/ui';
import { EstimatePreview, PricingRulesManagement } from '@/features/pricing';

export const metadata = { title: 'Pricing rules' };

/**
 * Owner: M7 — Delivery pricing rules configuration and live estimate preview.
 */
export default async function AdminPricingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Delivery Pricing Rules"
        description="Configure base fees, per-kg rates, and route-specific pricing tiers."
      />
      <EstimatePreview />
      <PricingRulesManagement />
    </div>
  );
}
