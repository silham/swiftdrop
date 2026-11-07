'use client';

import { CircleCheck, Gauge, Package, RefreshCw, Truck } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ChartCard,
  EmptyState,
  ProgressBar,
  StatCard,
  StatGrid,
  Table,
  type Column,
} from '@/components/ui';
import { BarChart } from '@/components/ui/charts';
import { courierState, summariseFleet, useCourierWorkload, utilisationPct } from './workload';

export interface CourierWorkloadItem {
  courierId: string;
  name: string;
  email?: string;
  zoneId: string | null;
  zoneName?: string | null;
  isAvailable: boolean;
  activeParcels: number;
  maxActiveParcels: number;
}

/** Owner: M7. Fleet KPIs, utilisation chart and the per-courier capacity table. */
export function CourierWorkload() {
  const { couriers, loading, error, reload } = useCourierWorkload();
  const fleet = summariseFleet(couriers);

  const chartData = [...couriers]
    .sort((a, b) => utilisationPct(b) - utilisationPct(a))
    .map((c) => ({
      name: c.name,
      active: c.activeParcels,
      free: Math.max(0, c.maxActiveParcels - c.activeParcels),
    }));

  const columns: Column<CourierWorkloadItem>[] = [
    {
      header: 'Courier',
      cell: (c) => (
        <div>
          <span className="block font-medium text-ink">{c.name}</span>
          {c.email && <span className="block text-xs text-muted">{c.email}</span>}
        </div>
      ),
    },
    {
      header: 'Assigned Zone',
      cell: (c) =>
        c.zoneName ? (
          <Badge>{c.zoneName}</Badge>
        ) : (
          <span className="text-xs text-muted italic">Unassigned</span>
        ),
    },
    {
      header: 'Status',
      cell: (c) => {
        const s = courierState(c);
        return (
          <Badge tone={s.tone} dot>
            {s.label}
          </Badge>
        );
      },
    },
    {
      header: 'Active Deliveries',
      cell: (c) => (
        <span className="font-semibold text-ink tabular-nums">
          {c.activeParcels}{' '}
          <span className="text-xs font-normal text-muted">/ {c.maxActiveParcels}</span>
        </span>
      ),
    },
    {
      header: 'Capacity Utilization',
      className: 'px-4 py-3 min-w-[200px]',
      cell: (c) => {
        const pct = utilisationPct(c);
        return (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted tabular-nums">
              <span>{pct}% utilized</span>
              <span>{Math.max(0, c.maxActiveParcels - c.activeParcels)} slots free</span>
            </div>
            <ProgressBar value={pct} tone="auto" size="sm" label={`${c.name} utilisation`} />
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      <StatGrid>
        <StatCard
          label="Fleet Couriers"
          value={fleet.total}
          icon={<Truck />}
          tone="info"
          loading={loading && couriers.length === 0}
          hint="Registered courier profiles"
        />
        <StatCard
          label="Available For Work"
          value={fleet.available}
          icon={<CircleCheck />}
          tone="success"
          loading={loading && couriers.length === 0}
          hint="Online with free capacity"
        />
        <StatCard
          label="Active Deliveries"
          value={fleet.active}
          icon={<Package />}
          tone="brand"
          loading={loading && couriers.length === 0}
          hint={`of ${fleet.capacity} total slots`}
        />
        <StatCard
          label="Fleet Utilization"
          value={`${fleet.utilisation}%`}
          icon={<Gauge />}
          tone={fleet.utilisation > 90 ? 'danger' : fleet.utilisation > 60 ? 'warning' : 'violet'}
          loading={loading && couriers.length === 0}
          hint="Active parcels ÷ capacity"
        />
      </StatGrid>

      <ChartCard
        title="Utilisation by courier"
        description="Active parcels against each courier's maximum capacity."
        loading={loading && couriers.length === 0}
        empty={couriers.length === 0}
        emptyTitle="No couriers yet"
        minHeight={0}
      >
        <BarChart
          data={chartData}
          xKey="name"
          xLabel="Courier"
          label="Active and free delivery slots per courier"
          stacked
          height={240}
          series={[
            { key: 'active', label: 'Active parcels', color: 'var(--sd-chart-1)' },
            { key: 'free', label: 'Free slots', color: 'var(--sd-line-strong)' },
          ]}
        />
      </ChartCard>

      <Card flush>
        <CardHeader
          title="Courier Capacities & Status"
          titleAs="h3"
          description="Live workload per courier. Refresh after making assignments."
          actions={
            <Button variant="secondary" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw
                className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
                aria-hidden="true"
              />
              {loading ? 'Refreshing...' : 'Refresh List'}
            </Button>
          }
        />
        <Table
          bare
          columns={columns}
          rows={couriers}
          rowKey={(c) => c.courierId}
          empty={
            <div className="p-5">
              <EmptyState
                compact
                title="No couriers found"
                description="No couriers with courier profiles have been registered in the system yet."
              />
            </div>
          }
        />
      </Card>
    </div>
  );
}
