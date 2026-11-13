import { Inbox, Layers, Send, Skull, TriangleAlert, Webhook } from 'lucide-react';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ProgressBar,
  StatCard,
  StatGrid,
  Table,
  Tabs,
  cn,
  type BadgeTone,
  type Column,
} from '@/components/ui';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import type { components } from '@/lib/api/schema';
import { RetryButton } from './RetryButton';

type Attempt = components['schemas']['WebhookAttemptDto'];
type AttemptStatus = Attempt['status'];
type QueueDepth = components['schemas']['QueueDepthDto'];

export const ATTEMPT_FILTERS: { value: AttemptStatus | 'ALL'; label: string }[] = [
  { value: 'DEAD', label: 'Dead' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'SUCCEEDED', label: 'Succeeded' },
  { value: 'ALL', label: 'All' },
];

const STATUS_TONE: Record<AttemptStatus, BadgeTone> = {
  PENDING: 'neutral',
  SUCCEEDED: 'success',
  FAILED: 'warning',
  DEAD: 'danger',
};

const STATUS_LABEL: Record<AttemptStatus, string> = {
  PENDING: 'Pending',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  DEAD: 'Dead',
};

/**
 * Owner: M8. Pipeline health tiles: outbox backlog, publish failures, DLQ depth, dead webhooks.
 * Any value can be missing when its endpoint failed; the tile then shows "—".
 */
export function OpsHealth({
  outbox,
  queues,
  deadAttempts,
}: {
  outbox?: { pending: number; failing: number };
  queues?: QueueDepth[];
  deadAttempts?: number;
}) {
  const dlq = queues?.filter((q) => q.kind === 'dlq').reduce((n, q) => n + (q.messages ?? 0), 0);
  return (
    <StatGrid cols={4}>
      <StatCard
        label="Outbox backlog"
        value={formatNumber(outbox?.pending)}
        icon={<Send />}
        tone={outbox && outbox.pending > 50 ? 'warning' : 'info'}
        hint="Waiting to be published"
      />
      <StatCard
        label="Failing to publish"
        value={formatNumber(outbox?.failing)}
        icon={<TriangleAlert />}
        tone={outbox && outbox.failing > 0 ? 'danger' : 'success'}
        hint="Last relay attempt failed"
      />
      <StatCard
        label="Dead-lettered messages"
        value={formatNumber(dlq)}
        icon={<Inbox />}
        tone={dlq ? 'danger' : 'success'}
        hint="Across all DLQs"
      />
      <StatCard
        label="Dead webhooks"
        value={formatNumber(deadAttempts)}
        icon={<Skull />}
        tone={deadAttempts ? 'danger' : 'success'}
        hint="Retries exhausted"
        href={deadAttempts ? '/admin/ops?status=DEAD' : undefined}
      />
    </StatGrid>
  );
}

/** Kept for callers that only have the outbox numbers. */
export function OutboxStats({ pending, failing }: { pending: number; failing: number }) {
  return <OpsHealth outbox={{ pending, failing }} />;
}

export function AttemptFilters({ active }: { active: AttemptStatus | 'ALL' }) {
  return (
    <Tabs
      label="Filter webhook attempts"
      value={active}
      items={ATTEMPT_FILTERS.map((f) => ({
        value: f.value,
        label: f.label,
        href: `/admin/ops?status=${f.value}`,
      }))}
    />
  );
}

const columns: Column<Attempt>[] = [
  {
    header: 'Status',
    cell: (a) => (
      <Badge tone={STATUS_TONE[a.status]} dot>
        {STATUS_LABEL[a.status]}
      </Badge>
    ),
  },
  {
    header: 'Endpoint',
    cell: (a) => <span className="block max-w-xs text-sm break-all text-ink">{a.endpointUrl}</span>,
  },
  {
    header: 'Event',
    cell: (a) => (
      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">
        {a.eventId.slice(0, 8)}
      </code>
    ),
  },
  { header: 'Try', cell: (a) => <span className="tabular-nums">#{a.attemptNumber}</span> },
  {
    header: 'HTTP',
    cell: (a) =>
      a.responseStatus ? (
        <span
          className={cn(
            'font-mono text-xs',
            a.responseStatus >= 200 && a.responseStatus < 300 ? 'text-success' : 'text-danger',
          )}
        >
          {a.responseStatus}
        </span>
      ) : (
        <span className="text-subtle">—</span>
      ),
  },
  {
    header: 'Error',
    cell: (a) =>
      a.errorMessage ? (
        <span className="block max-w-xs truncate text-xs text-muted" title={a.errorMessage}>
          {a.errorMessage}
        </span>
      ) : (
        <span className="text-subtle">—</span>
      ),
  },
  {
    header: 'When',
    cell: (a) => (
      <time
        dateTime={a.createdAt}
        title={formatDateTime(a.createdAt)}
        className="text-xs whitespace-nowrap text-muted"
      >
        {formatRelative(a.createdAt)}
      </time>
    ),
  },
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
    <>
      <Table
        bare
        dense
        columns={columns}
        rows={attempts}
        rowKey={(a) => a.id}
        caption="Webhook delivery attempts"
        empty={
          <EmptyState
            compact
            className="m-5"
            icon={<Webhook aria-hidden="true" />}
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
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Showing {attempts.length} of {total}. Retry re-sends the original event to that endpoint
          only and is written to the audit log.
        </p>
      )}
    </>
  );
}

/** Owner: M8. Work queue and dead-letter queue depths; a non-empty DLQ is highlighted. */
export function QueueDepths({ queues }: { queues: QueueDepth[] }) {
  const deadLettered = queues
    .filter((q) => q.kind === 'dlq')
    .reduce((n, q) => n + (q.messages ?? 0), 0);
  const max = Math.max(1, ...queues.map((q) => q.messages ?? 0));
  const queueColumns: Column<QueueDepth>[] = [
    {
      header: 'Queue',
      cell: (q) => <code className="font-mono text-xs text-ink">{q.name}</code>,
    },
    {
      header: 'Type',
      cell: (q) =>
        q.kind === 'dlq' ? (
          <Badge tone="danger">Dead-letter</Badge>
        ) : (
          <Badge tone="info">Work</Badge>
        ),
    },
    {
      header: 'Depth',
      cell: (q) =>
        q.messages == null ? (
          <span className="text-xs text-muted">unavailable</span>
        ) : (
          <div className="flex min-w-48 items-center gap-3">
            <ProgressBar
              size="sm"
              value={(q.messages / max) * 100}
              tone={q.kind === 'dlq' ? (q.messages > 0 ? 'danger' : 'success') : 'info'}
              label={`${q.name} depth`}
            />
            <span
              className={cn(
                'w-10 shrink-0 text-right text-sm tabular-nums',
                q.kind === 'dlq' && q.messages > 0 ? 'font-semibold text-danger' : 'text-ink',
              )}
            >
              {formatNumber(q.messages)}
            </span>
          </div>
        ),
    },
    {
      header: 'Consumers',
      cell: (q) =>
        q.consumers == null ? (
          <span className="text-subtle">—</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                q.consumers > 0 ? 'bg-success' : q.kind === 'work' ? 'bg-warning' : 'bg-subtle',
              )}
              aria-hidden="true"
            />
            {q.consumers}
          </span>
        ),
    },
  ];
  return (
    <section aria-labelledby="queues-heading">
      <Card flush>
        <CardHeader
          title={<span id="queues-heading">Queues</span>}
          description="RabbitMQ work queues and their dead-letter queues."
          icon={<Layers />}
        />
        {deadLettered > 0 && (
          <div className="border-b border-line p-4">
            <Alert tone="warning">
              {deadLettered} message(s) in dead-letter queues. Inspect them in the RabbitMQ console.
            </Alert>
          </div>
        )}
        <Table bare columns={queueColumns} rows={queues} rowKey={(q) => q.name} caption="Queues" />
      </Card>
    </section>
  );
}

export function OpsError({ message }: { message: string }) {
  return <Alert tone="error">{message}</Alert>;
}
