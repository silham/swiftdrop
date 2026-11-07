'use client';

import {
  Activity,
  ArrowRight,
  BellRing,
  ChartColumn,
  ChartPie,
  ServerCog,
  Store,
  Trophy,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ActivityFeed, Alert, Avatar, Badge, Button, ChartCard, cn } from '@/components/ui';
import { DonutChart } from '@/components/ui/charts';
import { api } from '@/lib/api/client';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { fetchOverview, type OverviewData, type OverviewErrors } from './overview-data';
import { CourierLeaderboard, DeliveryKpis, VolumeTrend } from './report-widgets';

export type { OverviewData, OverviewErrors } from './overview-data';

const linkClass =
  'inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover';

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={linkClass}>
      {children}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}

/** One line in the health / attention widgets. */
function SignalRow({
  icon: Icon,
  label,
  detail,
  value,
  tone,
  href,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  value: React.ReactNode;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  href?: string;
}) {
  const chip = {
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    neutral: 'bg-surface-2 text-muted',
  }[tone];
  const body = (
    <>
      <span
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', chip)}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block truncate text-xs text-muted">{detail}</span>
      </span>
      <span className="text-lg font-semibold text-ink tabular-nums">{value}</span>
    </>
  );
  const classes = 'flex items-center gap-3 rounded-lg px-2 py-2.5';
  return href ? (
    <Link href={href} className={cn(classes, 'transition hover:bg-surface-2')}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

function SystemHealth({ health }: { health: NonNullable<OverviewData['health']> }) {
  const queues = health.queues ?? [];
  const dlq = queues.filter((q) => q.kind === 'dlq').reduce((n, q) => n + (q.messages ?? 0), 0);
  const work = queues.filter((q) => q.kind === 'work');
  const backlog = work.reduce((n, q) => n + (q.messages ?? 0), 0);
  const noConsumers = work.filter((q) => q.consumers === 0).length;
  const healthy = health.failing === 0 && dlq === 0 && noConsumers === 0;
  return (
    <div className="space-y-1">
      <div className="mb-3 flex items-center gap-2">
        <Badge tone={healthy ? 'success' : 'warning'} dot>
          {healthy ? 'All systems operational' : 'Needs a look'}
        </Badge>
      </div>
      <SignalRow
        icon={ServerCog}
        label="Outbox backlog"
        detail={
          health.failing > 0 ? `${health.failing} failing to publish` : 'Events waiting to publish'
        }
        value={formatNumber(health.pending)}
        tone={health.failing > 0 ? 'danger' : health.pending > 50 ? 'warning' : 'success'}
        href="/admin/ops"
      />
      <SignalRow
        icon={Activity}
        label="Work queues"
        detail={
          health.queues
            ? noConsumers > 0
              ? `${noConsumers} queue(s) without consumers`
              : `${work.length} queues consuming`
            : 'Queue depths unavailable'
        }
        value={health.queues ? formatNumber(backlog) : '—'}
        tone={!health.queues ? 'neutral' : noConsumers > 0 ? 'warning' : 'success'}
        href="/admin/ops"
      />
      <SignalRow
        icon={Webhook}
        label="Dead-letter queues"
        detail={dlq > 0 ? 'Messages need inspection' : 'Nothing dead-lettered'}
        value={health.queues ? formatNumber(dlq) : '—'}
        tone={!health.queues ? 'neutral' : dlq > 0 ? 'danger' : 'success'}
        href="/admin/ops"
      />
    </div>
  );
}

function NeedsAttention({ attention }: { attention: NonNullable<OverviewData['attention']> }) {
  const pending = attention.pendingMerchants;
  const dead = attention.deadWebhooks;
  return (
    <div className="space-y-1">
      <SignalRow
        icon={Store}
        label="Merchant applications"
        detail={pending ? 'Waiting for approval' : 'No pending applications'}
        value={pending == null ? '—' : formatNumber(pending)}
        tone={pending == null ? 'neutral' : pending > 0 ? 'warning' : 'success'}
        href="/admin/merchants?status=PENDING"
      />
      <SignalRow
        icon={BellRing}
        label="Dead webhook deliveries"
        detail={dead ? 'Retry from event ops' : 'All deliveries healthy'}
        value={dead == null ? '—' : formatNumber(dead)}
        tone={dead == null ? 'neutral' : dead > 0 ? 'danger' : 'success'}
        href="/admin/ops?status=DEAD"
      />
    </div>
  );
}

export function AdminOverviewDashboard({
  initialData,
  initialErrors,
}: {
  initialData: OverviewData;
  initialErrors: OverviewErrors;
}) {
  const [data, setData] = useState(initialData);
  const [errors, setErrors] = useState(initialErrors);
  const [loading, setLoading] = useState(false);

  async function retry() {
    setLoading(true);
    const next = await fetchOverview(api);
    setData(next.data);
    setErrors(next.errors);
    setLoading(false);
  }

  const anyError = Object.values(errors).some(Boolean);
  const summary = data.summary;
  const daily = data.dailyVolume ?? [];

  return (
    <div className="space-y-6">
      {anyError && (
        <Alert
          tone="error"
          title="Some overview sections could not be loaded."
          action={
            <Button variant="secondary" size="sm" onClick={() => void retry()} disabled={loading}>
              {loading ? 'Retrying…' : 'Retry'}
            </Button>
          }
        />
      )}

      {errors.summary ? (
        <Alert tone="error">{errors.summary}</Alert>
      ) : (
        <DeliveryKpis summary={summary} daily={daily} loading={loading && !summary} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Delivery activity"
          description="Created and latest delivered / failed events per Asia/Colombo day."
          icon={<ChartColumn />}
          actions={<CardLink href="/admin/reports">View detailed reports</CardLink>}
          loading={loading && !data.dailyVolume}
          error={errors.dailyVolume}
          empty={daily.length === 0}
          emptyTitle="No delivery activity"
          emptyDescription="No daily volume data is available."
          minHeight={300}
        >
          <VolumeTrend daily={daily} />
        </ChartCard>

        <ChartCard
          title="Status mix"
          description="Parcels active in the last 30 days."
          icon={<ChartPie />}
          loading={loading && !summary}
          error={errors.summary}
          empty={!summary || summary.total === 0}
          emptyTitle="No parcels yet"
          minHeight={300}
          bodyClassName="flex items-center"
        >
          {summary && (
            <DonutChart
              className="w-full sm:flex-col xl:flex-col"
              label="Parcel status mix"
              centerLabel="Parcels"
              data={[
                { name: 'Delivered', value: summary.delivered, color: 'var(--sd-chart-3)' },
                { name: 'In progress', value: summary.inProgress, color: 'var(--sd-chart-2)' },
                { name: 'Failed', value: summary.failed, color: 'var(--sd-chart-4)' },
              ]}
            />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Courier performance"
          description="Top couriers by deliveries."
          icon={<Trophy />}
          actions={<CardLink href="/admin/reports">Details</CardLink>}
          loading={loading && !data.couriers}
          error={errors.couriers}
          empty={!data.couriers || data.couriers.length === 0}
          emptyTitle="No courier activity"
          emptyDescription="No assignments found."
          minHeight={200}
        >
          <CourierLeaderboard couriers={data.couriers ?? []} />
        </ChartCard>

        <ChartCard
          title="System health"
          description="Outbox and RabbitMQ."
          icon={<ServerCog />}
          actions={<CardLink href="/admin/ops">Event ops</CardLink>}
          loading={loading && !data.health}
          error={data.health ? undefined : errors.health}
          empty={!data.health}
          emptyTitle="Health data unavailable"
          minHeight={200}
        >
          {data.health && <SystemHealth health={data.health} />}
          {data.health && errors.health && (
            <p className="mt-2 text-xs text-danger">{errors.health}</p>
          )}
        </ChartCard>

        <ChartCard
          title="Needs attention"
          description="Waiting on an admin."
          icon={<BellRing />}
          loading={loading && !data.attention}
          error={data.attention ? undefined : errors.attention}
          empty={!data.attention}
          emptyTitle="Nothing to review"
          minHeight={200}
        >
          {data.attention && <NeedsAttention attention={data.attention} />}
        </ChartCard>
      </div>

      <ChartCard
        title="Recent audit activity"
        description="Safe administrative activity summary."
        icon={<Activity />}
        actions={<CardLink href="/admin/audit">View all</CardLink>}
        loading={loading && !data.audit}
        error={errors.audit}
        empty={!data.audit?.data.length}
        emptyTitle="No recent audit activity"
        emptyDescription="Administrative activity will appear here when recorded."
        minHeight={160}
      >
        <ActivityFeed
          items={(data.audit?.data ?? []).map((entry) => {
            const who = entry.actor?.name ?? 'System';
            return {
              id: entry.id,
              leading: <Avatar name={who} size="md" />,
              title: (
                <>
                  <span className="font-medium">{who}</span>{' '}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">
                    {entry.action}
                  </code>
                </>
              ),
              description: `${entry.entityType} · ${entry.actor?.role ?? entry.actorRole ?? 'SYSTEM'}`,
              time: (
                <time dateTime={entry.timestamp} title={formatDateTime(entry.timestamp)}>
                  {formatRelative(entry.timestamp)}
                </time>
              ),
            };
          })}
        />
      </ChartCard>
    </div>
  );
}
