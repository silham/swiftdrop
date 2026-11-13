'use client';

import { CircleCheck, CircleX, Gauge, Package, Truck } from 'lucide-react';
import { StatCard, StatGrid } from '@/components/ui';
import { AreaTrend, BarChart, BarList, type Series } from '@/components/ui/charts';
import { formatNumber, formatPercent } from '@/lib/format';

/** Shared report types + widgets for the admin overview and the reports page. Owner: M9. */
export type DeliverySummary = {
  total: number;
  delivered: number;
  failed: number;
  inProgress: number;
  successRate: number;
};

export type DailyVolume = {
  date: string;
  created: number;
  delivered: number;
  failed: number;
};

export type CourierPerformance = {
  courierId: string;
  name: string;
  assigned: number;
  delivered: number;
  failed: number;
};

export const VOLUME_SERIES: Series[] = [
  { key: 'created', label: 'Created', color: 'var(--sd-chart-1)' },
  { key: 'delivered', label: 'Delivered', color: 'var(--sd-chart-3)' },
  { key: 'failed', label: 'Failed', color: 'var(--sd-chart-4)' },
];

const shortDate = new Intl.DateTimeFormat('en-LK', { month: 'short', day: 'numeric' });

/** "2026-10-20" → "Oct 20" (dates are already Colombo calendar days). */
export function formatDay(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : shortDate.format(d);
}

export function courierSuccessRate(row: CourierPerformance) {
  const outcomes = row.delivered + row.failed;
  return outcomes === 0 ? 0 : row.delivered / outcomes;
}

export function percentage(value: number) {
  return formatPercent(value, 1);
}

/** % change of the last 7 days vs the 7 days before; null when there is no baseline. */
function weekOverWeek(daily: DailyVolume[], pick: (d: DailyVolume) => number) {
  if (daily.length < 14) return null;
  const sum = (rows: DailyVolume[]) => rows.reduce((n, r) => n + pick(r), 0);
  const last = sum(daily.slice(-7));
  const prior = sum(daily.slice(-14, -7));
  return prior === 0 ? null : ((last - prior) / prior) * 100;
}

/** Five KPI tiles with sparklines and week-over-week deltas from the daily series. */
export function DeliveryKpis({
  summary,
  daily = [],
  loading = false,
}: {
  summary?: DeliverySummary;
  daily?: DailyVolume[];
  loading?: boolean;
}) {
  const created = daily.map((d) => d.created);
  const delivered = daily.map((d) => d.delivered);
  const failed = daily.map((d) => d.failed);
  const rate = daily
    .filter((d) => d.delivered + d.failed > 0)
    .map((d) => d.delivered / (d.delivered + d.failed));
  const busy = loading || !summary;
  const deltas = {
    created: weekOverWeek(daily, (d) => d.created),
    delivered: weekOverWeek(daily, (d) => d.delivered),
    failed: weekOverWeek(daily, (d) => d.failed),
  };
  const hint = (delta: number | null) => (delta == null ? '30-day trend' : 'vs prior 7d');
  return (
    <StatGrid cols={5}>
      <StatCard
        label="Total parcels"
        value={formatNumber(summary?.total)}
        icon={<Package />}
        tone="brand"
        trend={created}
        delta={deltas.created}
        hint={hint(deltas.created)}
        loading={busy}
      />
      <StatCard
        label="Delivered"
        value={formatNumber(summary?.delivered)}
        icon={<CircleCheck />}
        tone="success"
        trend={delivered}
        delta={deltas.delivered}
        hint={hint(deltas.delivered)}
        loading={busy}
      />
      <StatCard
        label="In progress"
        value={formatNumber(summary?.inProgress)}
        icon={<Truck />}
        tone="info"
        hint="Awaiting an outcome"
        loading={busy}
      />
      <StatCard
        label="Failed"
        value={formatNumber(summary?.failed)}
        icon={<CircleX />}
        tone="danger"
        trend={failed}
        delta={deltas.failed}
        deltaGood="down"
        hint={hint(deltas.failed)}
        loading={busy}
      />
      <StatCard
        label="Success rate"
        value={summary ? percentage(summary.successRate) : '—'}
        icon={<Gauge />}
        tone="violet"
        trend={rate}
        hint="Of completed parcels"
        loading={busy}
      />
    </StatGrid>
  );
}

export function VolumeTrend({ daily, height = 280 }: { daily: DailyVolume[]; height?: number }) {
  return (
    <AreaTrend
      data={daily}
      xKey="date"
      series={VOLUME_SERIES}
      height={height}
      label="Daily parcels created, delivered and failed"
      xFormatter={formatDay}
      valueFormatter={(v) => formatNumber(v)}
    />
  );
}

export function VolumeBars({ daily, height = 300 }: { daily: DailyVolume[]; height?: number }) {
  return (
    <BarChart
      data={daily}
      xKey="date"
      xLabel="Date"
      series={VOLUME_SERIES}
      height={height}
      label="Daily parcel events: created, delivered and failed"
      stacked
      xFormatter={formatDay}
      valueFormatter={(v) => formatNumber(v)}
    />
  );
}

/** Couriers ranked by delivered parcels, with their success rate. */
export function CourierLeaderboard({
  couriers,
  limit = 5,
}: {
  couriers: CourierPerformance[];
  limit?: number;
}) {
  const ranked = [...couriers]
    .sort((a, b) => b.delivered - a.delivered || b.assigned - a.assigned)
    .slice(0, limit);
  return (
    <BarList
      items={ranked.map((c) => ({
        key: c.courierId,
        label: c.name,
        value: c.delivered,
        secondary: `${percentage(courierSuccessRate(c))} · ${formatNumber(c.assigned)} assigned`,
      }))}
      valueFormatter={(v) => `${formatNumber(v)} delivered`}
      color="bg-success-soft"
    />
  );
}
