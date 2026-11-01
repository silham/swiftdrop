'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';

/** Owner: M8. Re-queues the event of a FAILED/DEAD webhook attempt for its endpoint. */
export function RetryButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string }>();

  async function retry() {
    setPending(true);
    setMessage(undefined);
    const { error } = await api.POST('/api/v1/admin/ops/webhook-attempts/{id}/retry', {
      params: { path: { id: attemptId } },
    });
    setPending(false);
    if (error) return setMessage({ tone: 'error', text: errorMessage(error, 'Retry failed') });
    setMessage({ tone: 'ok', text: 'Queued' });
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" onClick={retry} disabled={pending} className="px-3 py-1">
        {pending ? 'Queuing…' : 'Retry'}
      </Button>
      {message && (
        <span
          role="status"
          className={message.tone === 'ok' ? 'text-xs text-success' : 'text-xs text-danger'}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
