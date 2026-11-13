'use client';

import { CalendarRange, ChartColumn, Download, RotateCcw, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  ChartCard,
  FormField,
  Input,
  ProgressBar,
  Select,
  Table,
  Tabs,
  type Column,
} from '@/components/ui';
import { BarChart } from '@/components/ui/charts';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { formatNumber } from '@/lib/format';
import type { Role } from '@swiftdrop/contracts';
import { csvCell } from './csv';
import {
  courierSuccessRate,
  DeliveryKpis,
  percentage,
  VolumeBars,
  type CourierPerformance,
  type DailyVolume,
  type DeliverySummary,
} from './report-widgets';

export interface ReportZone {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ReportData {
  summary: DeliverySummary;
  dailyVolume: DailyVolume[];
  couriers: CourierPerformance[];
}

interface ReportsDashboardProps {
  role: Role;
  initialData: ReportData | null;
  initialError?: string;
  zoneError?: string;
  zones: ReportZone[];
}

type SortKey = 'delivered' | 'success' | 'assigned';

function exportCsv(data: ReportData) {
  const rows = [
    ['Daily volume'],
    ['Date', 'Created', 'Delivered', 'Failed'],
    ...data.dailyVolume.map((row) => [row.date, row.created, row.delivered, row.failed]),
    [],
    ['Courier performance'],
    ['Courier', 'Assigned', 'Delivered', 'Failed', 'Success rate'],
    ...data.couriers.map((row) => [
      row.name,
      row.assigned,
      row.delivered,
      row.failed,
      percentage(courierSuccessRate(row)),
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => csvCell(cell ?? '')).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'swiftdrop-reports.csv';
  link.click();
  URL.revokeObjectURL(url);
}

const courierColumns: Column<CourierPerformance>[] = [
  {
    header: 'Courier',
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={row.name} size="sm" />
        <span className="font-medium text-ink">{row.name}</span>
      </span>
    ),
  },
  {
    header: 'Assigned',
    cell: (row) => formatNumber(row.assigned),
    className: 'px-4 py-3 text-right tabular-nums',
    headerClassName: 'text-right',
  },
  {
    header: 'Delivered',
    cell: (row) => formatNumber(row.delivered),
    className: 'px-4 py-3 text-right tabular-nums',
    headerClassName: 'text-right',
  },
  {
    header: 'Failed',
    cell: (row) => (
      <span className={row.failed > 0 ? 'text-danger' : undefined}>{formatNumber(row.failed)}</span>
    ),
    className: 'px-4 py-3 text-right tabular-nums',
    headerClassName: 'text-right',
  },
  {
    header: 'Success rate',
    cell: (row) => {
      const rate = courierSuccessRate(row);
      const outcomes = row.delivered + row.failed;
      return (
        <div className="flex min-w-40 items-center gap-3">
          <ProgressBar
            value={rate * 100}
            tone={
              outcomes === 0 ? 'info' : rate >= 0.9 ? 'success' : rate >= 0.7 ? 'warning' : 'danger'
            }
            size="sm"
            label={`${row.name} success rate`}
          />
          <span className="w-12 shrink-0 text-right text-xs font-medium text-ink tabular-nums">
            {outcomes === 0 ? '—' : percentage(rate)}
          </span>
        </div>
      );
    },
  },
];

export function ReportsDashboard({
  role,
  initialData,
  initialError,
  zoneError,
  zones,
}: ReportsDashboardProps) {
  const [data, setData] = useState<ReportData | null>(initialData);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [sort, setSort] = useState<SortKey>('delivered');
  const activeZones = zones.filter((zone) => zone.isActive);
  const rangeInvalid = Boolean(from && to && to < from);

  async function loadReports(query: { from?: string; to?: string; zoneId?: string }) {
    setLoading(true);
    setError(undefined);
    // A network failure rejects instead of returning { error }; show it rather than spin forever.
    const responses = await Promise.all([
      api.GET('/api/v1/admin/reports/deliveries', { params: { query } }),
      api.GET('/api/v1/admin/reports/daily-volume', { params: { query } }),
      api.GET('/api/v1/admin/reports/couriers', { params: { query } }),
    ]).catch(() => null);
    setLoading(false);
    if (!responses) {
      setError('Could not reach the server. Check your connection and try again.');
      return;
    }
    const [summary, dailyVolume, couriers] = responses;
    const requestError = summary.error ?? dailyVolume.error ?? couriers.error;
    if (requestError || !summary.data || !dailyVolume.data || !couriers.data) {
      setError(errorMessage(requestError, 'Could not load reports'));
      return;
    }
    setData({ summary: summary.data, dailyVolume: dailyVolume.data, couriers: couriers.data });
  }

  const currentQuery = () => ({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(zoneId ? { zoneId } : {}),
  });

  function reset() {
    setFrom('');
    setTo('');
    setZoneId('');
    void loadReports({});
  }

  const couriers = useMemo(() => {
    const rows = [...(data?.couriers ?? [])];
    const by: Record<SortKey, (r: CourierPerformance) => number> = {
      delivered: (r) => r.delivered,
      assigned: (r) => r.assigned,
      success: (r) => courierSuccessRate(r),
    };
    return rows.sort((a, b) => by[sort](b) - by[sort](a) || a.name.localeCompare(b.name));
  }, [data, sort]);

  const hasOutcomes = couriers.some((c) => c.delivered + c.failed > 0);
  const zoneName = activeZones.find((z) => z.id === zoneId)?.name;

  return (
    <div className="space-y-6">
      <Card className="lg:sticky lg:top-20 lg:z-10">
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] lg:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (!rangeInvalid) void loadReports(currentQuery());
          }}
        >
          <FormField label="From" htmlFor="report-from">
            <Input
              id="report-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </FormField>
          <FormField
            label="To"
            htmlFor="report-to"
            error={rangeInvalid ? 'End date cannot be before the start date.' : undefined}
          >
            <Input
              id="report-to"
              type="date"
              value={to}
              min={from || undefined}
              aria-invalid={rangeInvalid}
              onChange={(event) => setTo(event.target.value)}
            />
          </FormField>
          <FormField label="Zone" htmlFor="report-zone">
            <Select
              id="report-zone"
              value={zoneId}
              onChange={(event) => setZoneId(event.target.value)}
              disabled={Boolean(zoneError)}
            >
              <option value="">All zones</option>
              {activeZones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} ({zone.code})
                </option>
              ))}
            </Select>
          </FormField>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button
              type="submit"
              disabled={loading || rangeInvalid}
              className="flex-1 lg:flex-none"
            >
              {loading ? 'Loading…' : 'Apply filters'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={reset}
              disabled={loading}
              aria-label="Reset filters"
              title="Reset filters"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
            {from || to ? `${from || '…'} → ${to || 'today'}` : 'Last 30 days'}
            {zoneName ? ` · ${zoneName}` : ' · All zones'}
          </span>
          <span>
            Asia/Colombo calendar days. KPI cards count unique parcels with activity in the range;
            daily rows show creation and latest terminal events.
          </span>
        </div>
        {zoneError ? (
          <Alert tone="warning" className="mt-3">
            {zoneError}. Zone filtering is unavailable until the Zone Management service is
            available.
          </Alert>
        ) : activeZones.length === 0 ? (
          <p className="mt-3 text-xs text-muted">
            No configured delivery zones are available. All zones is selected.
          </p>
        ) : null}
      </Card>

      {error ? (
        <Alert
          tone="error"
          action={
            <Button variant="secondary" size="sm" onClick={() => void loadReports(currentQuery())}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      <div
        className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}
        aria-busy={loading}
      >
        {data || loading ? (
          <div className="space-y-6">
            <DeliveryKpis summary={data?.summary} daily={data?.dailyVolume} loading={!data} />

            <ChartCard
              title="Daily delivery volume"
              description="Creation and latest delivered / failed events by Colombo calendar day."
              icon={<ChartColumn />}
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => data && exportCsv(data)}
                  disabled={!data}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Export CSV
                </Button>
              }
              loading={!data}
              empty={data?.dailyVolume.length === 0}
              emptyTitle="No daily volume data"
              emptyDescription="Try a different date range or zone."
              minHeight={320}
            >
              {data && <VolumeBars daily={data.dailyVolume} />}
            </ChartCard>

            <ChartCard
              title="Courier performance"
              description={
                role === 'ADMIN'
                  ? 'Delivery outcomes by courier.'
                  : 'Courier workload and delivery outcomes.'
              }
              icon={<Users />}
              actions={
                <Tabs
                  label="Sort couriers by"
                  value={sort}
                  onChange={(v) => setSort(v as SortKey)}
                  items={[
                    { value: 'delivered', label: 'Delivered' },
                    { value: 'success', label: 'Success rate' },
                    { value: 'assigned', label: 'Assigned' },
                  ]}
                />
              }
              loading={!data}
              empty={couriers.length === 0}
              emptyTitle="No courier activity"
              emptyDescription="No assignments matched this date range."
              minHeight={120}
              flush
            >
              <div>
                {hasOutcomes && (
                  <div className="border-b border-line p-5">
                    <BarChart
                      data={couriers.slice(0, 10)}
                      xKey="name"
                      xLabel="Courier"
                      layout="horizontal-bars"
                      stacked
                      height={Math.max(120, Math.min(couriers.length, 10) * 36 + 40)}
                      label="Delivered and failed parcels per courier"
                      series={[
                        { key: 'delivered', label: 'Delivered', color: 'var(--sd-chart-3)' },
                        { key: 'failed', label: 'Failed', color: 'var(--sd-chart-4)' },
                      ]}
                      valueFormatter={(v) => formatNumber(v)}
                    />
                  </div>
                )}
                <Table
                  bare
                  columns={courierColumns}
                  rows={couriers}
                  rowKey={(row) => row.courierId}
                  caption="Courier performance"
                />
              </div>
            </ChartCard>
          </div>
        ) : null}
      </div>
    </div>
  );
}
