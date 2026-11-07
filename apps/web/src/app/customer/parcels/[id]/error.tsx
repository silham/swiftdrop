'use client';

import { Alert, Button, PageHeader } from '@/components/ui';

export default function ParcelDetailsError({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeader
        title="Delivery details"
        description="Status history and receipt"
        breadcrumbs={[{ label: 'My deliveries', href: '/customer' }, { label: 'Delivery details' }]}
      />
      <Alert
        tone="error"
        title="We could not load this delivery"
        action={
          <Button type="button" variant="secondary" size="sm" onClick={reset}>
            Try again
          </Button>
        }
      >
        Please try again.
      </Alert>
    </>
  );
}
