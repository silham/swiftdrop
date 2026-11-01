import { PageHeader } from '@/components/ui';
import { CourierWorkload } from '@/features/dispatch';

export const metadata = { title: 'Courier workload' };

/**
 * Owner: M7 — Courier fleet workload management and capacity monitoring.
 */
export default async function DispatchCouriersPage() {
  return (
    <>
      <PageHeader
        title="Courier Workload"
        description="Monitor active parcel assignments and fleet capacity across delivery zones."
      />
      <CourierWorkload />
    </>
  );
}
