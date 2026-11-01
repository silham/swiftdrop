import { PageHeader } from '@/components/ui';
import {
  AttemptFilters,
  AttemptsTable,
  OpsError,
  OutboxStats,
  QueueDepths,
} from '@/features/ops/EventOps';
import { serverApi } from '@/lib/api/server';
import { errorMessage } from '@/lib/api/errors';
import { requireRole } from '@/lib/auth/session';

export const metadata = { title: 'Event operations' };

const STATUSES = ['DEAD', 'FAILED', 'SUCCEEDED'] as const;

/** Owner: M8. Outbox backlog + webhook delivery attempts (default: dead-lettered ones) with retry. */
export default async function AdminOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(['ADMIN']);
  const { status: raw } = await searchParams;
  const status = (STATUSES as readonly string[]).includes(raw ?? '')
    ? (raw as (typeof STATUSES)[number])
    : raw === 'ALL'
      ? 'ALL'
      : 'DEAD';

  const api = await serverApi();
  const [outbox, queues, attempts] = await Promise.all([
    api.GET('/api/v1/admin/ops/outbox'),
    api.GET('/api/v1/admin/ops/queues'),
    api.GET('/api/v1/admin/ops/webhook-attempts', {
      params: { query: { pageSize: 50, ...(status === 'ALL' ? {} : { status }) } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={'Event operations'}
        description="Outbox backlog and dead-lettered webhooks"
      />
      <div className="space-y-6">
        {outbox.data ? (
          <OutboxStats pending={outbox.data.pending} failing={outbox.data.failing} />
        ) : (
          <OpsError message={errorMessage(outbox.error, 'Could not load the outbox backlog')} />
        )}
        {queues.data ? (
          <QueueDepths queues={queues.data} />
        ) : (
          <OpsError message={errorMessage(queues.error, 'Could not load queue depths')} />
        )}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Webhook deliveries</h2>
          <AttemptFilters active={status} />
          {attempts.data ? (
            <AttemptsTable
              attempts={attempts.data.data}
              total={attempts.data.meta.total}
              status={status}
            />
          ) : (
            <OpsError message={errorMessage(attempts.error, 'Could not load webhook attempts')} />
          )}
        </section>
      </div>
    </>
  );
}
