import Link from 'next/link';
import { Alert, Card, EmptyState, Table, cn, type Column } from '@/components/ui';
import type { components } from '@/lib/api/schema';
import { RetryButton } from './RetryButton';

type Attempt = components['schemas']['WebhookAttemptDto'];
type AttemptStatus = Attempt['status'];

export const ATTEMPT_FILTERS: { value: AttemptStatus | 'ALL'; label: string }[] = [
  { value: 'DEAD', label: 'Dead' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'SUCCEEDED', label: 'Succeeded' },
  { value: 'ALL', label: 'All' },
];

const STATUS_STYLES: Record<AttemptStatus, string> = {
  PENDING: 'bg-canvas text-muted',
  SUCCEEDED: 'bg-success/10 text-success',
  FAILED: 'bg-warning/10 text-warning',
  DEAD: 'bg-danger/10 text-danger',
};

/** Owner: M8. Outbox backlog counters. */
export function OutboxStats({ pending, failing }: { pending: number; failing: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <p className="text-sm text-muted">Waiting to be published</p>
        <p className="mt-1 text-3xl font-semibold">{pending}</p>
        <p className="mt-1 text-xs text-muted">
          Outbox rows the relay has not sent to RabbitMQ yet.
        </p>
      </Card>
      <Card>
        <p className="text-sm text-muted">Failing to publish</p>
        <p className={cn('mt-1 text-3xl font-semibold', failing > 0 && 'text-danger')}>{failing}</p>
        <p className="mt-1 text-xs text-muted">Pending rows whose last publish attempt failed.</p>
      </Card>
    </div>
  );
}

export function AttemptFilters({ active }: { active: AttemptStatus | 'ALL' }) {
  return (
    <nav aria-label="Filter webhook attempts" className="flex flex-wrap gap-2">
      {ATTEMPT_FILTERS.map((f) => (
        <Link
          key={f.value}
          href={`/admin/ops?status=${f.value}`}
          aria-current={f.value === active ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3 py-1 text-sm',
            f.value === active
              ? 'border-brand bg-brand-soft text-brand-dark'
              : 'border-line bg-surface hover:bg-canvas',
          )}
        >
          {f.label}
        </Link>
      ))}
    </nav>
  );
}

const columns: Column<Attempt>[] = [
  {
    header: 'Status',
    cell: (a) => (
      <span
        className={cn(
          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
          STATUS_STYLES[a.status],
        )}
      >
        {a.status}
      </span>
    ),
  },
  {
    header: 'Endpoint',
    cell: (a) => <span className="break-all">{a.endpointUrl}</span>,
  },
  {
    header: 'Event',
    cell: (a) => <code className="text-xs">{a.eventId.slice(0, 8)}</code>,
  },
  { header: 'Try', cell: (a) => a.attemptNumber },
  { header: 'HTTP', cell: (a) => a.responseStatus ?? '—' },
  { header: 'Error', cell: (a) => a.errorMessage ?? '—' },
  { header: 'When', cell: (a) => new Date(a.createdAt).toLocaleString() },
  {
    header: 'Action',
    cell: (a) =>
      a.status === 'DEAD' || a.status === 'FAILED' ? <RetryButton attemptId={a.id} /> : null,
  },
];

export function AttemptsTable({
  attempts,
  total,
  status,
}: {
  attempts: Attempt[];
  total: number;
  status: AttemptStatus | 'ALL';
}) {
  return (
    <div className="space-y-3">
      <Table
        columns={columns}
        rows={attempts}
        rowKey={(a) => a.id}
        empty={
          <EmptyState
            title="No webhook attempts"
            description={
              status === 'DEAD'
                ? 'Nothing is dead-lettered. All deliveries are succeeding or still retrying.'
                : 'No attempts match this filter.'
            }
          />
        }
      />
      {attempts.length > 0 && (
        <p className="text-xs text-muted">
          Showing {attempts.length} of {total}. Retry re-sends the original event to that endpoint
          only and is written to the audit log.
        </p>
      )}
    </div>
  );
}

type QueueDepth = components['schemas']['QueueDepthDto'];

/** Owner: M8. Work queue and dead-letter queue depths; a non-empty DLQ is highlighted. */
export function QueueDepths({ queues }: { queues: QueueDepth[] }) {
  const deadLettered = queues
    .filter((q) => q.kind === 'dlq')
    .reduce((n, q) => n + (q.messages ?? 0), 0);
  return (
    <section className="space-y-3" aria-labelledby="queues-heading">
      <h2 id="queues-heading" className="text-lg font-semibold">
        Queues
      </h2>
      {deadLettered > 0 && (
        <Alert tone="warning">
          {deadLettered} message(s) in dead-letter queues. Inspect them in the RabbitMQ console.
        </Alert>
      )}
      <Table
        columns={[
          { header: 'Queue', cell: (q: QueueDepth) => <code className="text-xs">{q.name}</code> },
          { header: 'Type', cell: (q: QueueDepth) => (q.kind === 'dlq' ? 'Dead-letter' : 'Work') },
          {
            header: 'Messages',
            cell: (q: QueueDepth) => (
              <span
                className={cn(
                  q.kind === 'dlq' && (q.messages ?? 0) > 0 && 'font-semibold text-danger',
                )}
              >
                {q.messages ?? 'unavailable'}
              </span>
            ),
          },
          { header: 'Consumers', cell: (q: QueueDepth) => q.consumers ?? '—' },
        ]}
        rows={queues}
        rowKey={(q) => q.name}
      />
    </section>
  );
}

export function OpsError({ message }: { message: string }) {
  return <Alert tone="error">{message}</Alert>;
}
