import { Webhook } from 'lucide-react';
import { Card, CardHeader, PageHeader } from '@/components/ui';
import {
  AttemptFilters,
  AttemptsTable,
  OpsError,
  OpsHealth,
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
  const [outbox, queues, attempts, dead] = await Promise.all([
    api.GET('/api/v1/admin/ops/outbox'),
    api.GET('/api/v1/admin/ops/queues'),
    api.GET('/api/v1/admin/ops/webhook-attempts', {
      params: { query: { pageSize: 50, ...(status === 'ALL' ? {} : { status }) } },
    }),
    status === 'DEAD'
      ? Promise.resolve(null)
      : api.GET('/api/v1/admin/ops/webhook-attempts', {
          params: { query: { pageSize: 1, status: 'DEAD' } },
        }),
  ]);
  const deadTotal =
    status === 'DEAD' ? attempts.data?.meta.total : (dead?.data?.meta.total ?? undefined);

  return (
    <>
      <PageHeader
        title={'Event operations'}
        description="Outbox backlog, queue depths and dead-lettered webhooks"
      />
      <div className="space-y-6">
        {!outbox.data && (
          <OpsError message={errorMessage(outbox.error, 'Could not load the outbox backlog')} />
        )}
        <OpsHealth outbox={outbox.data} queues={queues.data} deadAttempts={deadTotal} />
        {queues.data ? (
          <QueueDepths queues={queues.data} />
        ) : (
          <OpsError message={errorMessage(queues.error, 'Could not load queue depths')} />
        )}
        <Card flush>
          <CardHeader
            title="Webhook deliveries"
            description="Merchant webhook attempts. Failed ones retry automatically; dead ones need a manual retry."
            icon={<Webhook />}
            actions={<AttemptFilters active={status} />}
          />
          {attempts.data ? (
            <AttemptsTable
              attempts={attempts.data.data}
              total={attempts.data.meta.total}
              status={status}
            />
          ) : (
            <div className="p-5">
              <OpsError message={errorMessage(attempts.error, 'Could not load webhook attempts')} />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
