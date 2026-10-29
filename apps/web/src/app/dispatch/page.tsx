import { PageHeader } from '@/components/ui';
import { UnassignedQueue } from '@/features/dispatch';

export const metadata = { title: 'Unassigned parcels' };

/**
 * Owner: M7 — Dispatch portal: unassigned parcels queue and courier assignment.
 */
export default async function DispatchPage() {
  return (
    <>
      <PageHeader
        title="Unassigned Parcels"
        description="Monitor booked parcels awaiting courier assignment and allocate fleet resources."
      />
      <UnassignedQueue />
    </>
  );
}
