import { Camera, CircleCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardBody, CardHeader, KeyValue, PageHeader } from '@/components/ui';
import { ActionBar } from '@/features/courier';

export const metadata = { title: 'Delivery' };

/**
 * Owner: M6. TODO(M6): GET the parcel, PATCH /api/v1/courier/parcels/{id}/status; POST /proof
 * (multipart, camera capture on mobile). Until then the actions are shown disabled.
 * Components live in src/features/courier/.
 */
export default async function CourierParcelsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Delivery — ${id}`}
        description="Update status, capture proof or failure reason"
        breadcrumbs={[{ label: 'My deliveries', href: '/courier' }, { label: 'Delivery' }]}
      />
      <Card flush>
        <CardHeader
          title="Delivery details"
          description="Recipient, address and parcel information appear here once available."
        />
        <CardBody>
          <KeyValue
            columns={2}
            items={[
              { label: 'Recipient', value: '—' },
              { label: 'Drop-off', value: '—' },
              { label: 'Parcel', value: '—' },
              { label: 'Status', value: '—' },
            ]}
          />
        </CardBody>
      </Card>
      <Card flush>
        <CardHeader
          title="Proof of delivery"
          description="Take a photo at the door when you hand over the parcel."
        />
        <CardBody className="flex items-center gap-3 text-sm text-muted">
          <Camera className="h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />
          Camera capture opens from the Mark delivered action.
        </CardBody>
      </Card>
      <p className="text-sm text-muted">
        <Link href="/courier" className="font-medium text-brand hover:text-brand-hover">
          Back to my deliveries
        </Link>
      </p>
      <ActionBar
        note="Status updates will be enabled when this delivery is available."
        secondary={
          <Button type="button" variant="secondary" size="lg" disabled>
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            Report a problem
          </Button>
        }
        primary={
          <Button type="button" size="lg" disabled>
            <CircleCheck className="h-4 w-4" aria-hidden="true" />
            Mark delivered
          </Button>
        }
      />
    </div>
  );
}
