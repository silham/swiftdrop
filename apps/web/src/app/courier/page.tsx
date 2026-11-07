import { PageHeader } from '@/components/ui';
import { CourierEmptyState, CourierHowItWorks, CourierTodaySummary } from '@/features/courier';

export const metadata = { title: 'My deliveries' };

/**
 * Owner: M6. TODO(M6): GET /api/v1/courier/parcels — render each parcel with <DeliveryCard> and
 * pass today's counts to <CourierTodaySummary>. The API returns 501 until then, so nothing is
 * fetched here yet. Components live in src/features/courier/.
 */
export default async function CourierPage() {
  return (
    <div className="space-y-6">
      <PageHeader title={'My deliveries'} description="Parcels assigned to you" eyebrow="Today" />
      <CourierTodaySummary />
      <section aria-labelledby="assigned-heading" className="space-y-3">
        <h2 id="assigned-heading" className="text-sm font-semibold text-ink">
          Assigned to you
        </h2>
        <CourierEmptyState />
      </section>
      <section aria-labelledby="how-heading" className="space-y-3">
        <h2 id="how-heading" className="text-sm font-semibold text-ink">
          How it works
        </h2>
        <CourierHowItWorks />
      </section>
    </div>
  );
}
