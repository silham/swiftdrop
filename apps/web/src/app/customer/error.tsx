'use client';

import { Alert, Button } from '@/components/ui';

/** Applies to every /customer page, so the copy stays generic. */
export default function CustomerError({ reset }: { reset: () => void }) {
  return (
    <Alert
      tone="error"
      title="We could not load this page"
      action={
        <Button type="button" variant="secondary" size="sm" onClick={reset}>
          Try again
        </Button>
      }
    >
      Please try again. If the problem continues, check back in a few minutes.
    </Alert>
  );
}
