import { PageHeader } from '@/components/ui';
import { ZonesManagement } from '@/features/pricing';

export const metadata = { title: 'Delivery zones' };

/**
 * Owner: M7 — Delivery zones management (CRUD, active toggle, serviced cities).
 */
export default async function AdminZonesPage() {
  return (
    <>
      <PageHeader
        title="Delivery Zones"
        description="Configure geographical service areas and the cities serviced by each zone."
      />
      <ZonesManagement />
    </>
  );
}
