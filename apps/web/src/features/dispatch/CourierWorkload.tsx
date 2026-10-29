'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, EmptyState, Table, type Column } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';

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

export function CourierWorkload() {
  const [couriers, setCouriers] = useState<CourierWorkloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  async function loadWorkload() {
    setLoading(true);
    setError(undefined);

    const { data, error: apiErr } = await api.GET('/api/v1/dispatch/couriers/workload');
    setLoading(false);

    if (apiErr || !data) {
      setError(errorMessage(apiErr, 'Failed to load courier workloads'));
      return;
    }

    setCouriers(data);
  }

  useEffect(() => {
    void loadWorkload();
  }, []);

  const totalCouriers = couriers.length;
  const availableCouriers = couriers.filter(
    (c) => c.isAvailable && c.activeParcels < c.maxActiveParcels,
  ).length;
  const totalActiveParcels = couriers.reduce((acc, c) => acc + c.activeParcels, 0);
  const totalCapacity = couriers.reduce((acc, c) => acc + c.maxActiveParcels, 0);

  const columns: Column<CourierWorkloadItem>[] = [
    {
      header: 'Courier',
      cell: (c) => (
        <div>
          <span className="font-medium text-ink block">{c.name}</span>
          {c.email && <span className="text-xs text-muted block">{c.email}</span>}
        </div>
      ),
    },
    {
      header: 'Assigned Zone',
      cell: (c) => (
        <span className="text-muted">
          {c.zoneName ? (
            <span className="inline-flex items-center rounded-md bg-canvas px-2 py-1 text-xs font-medium border border-line">
              {c.zoneName}
            </span>
          ) : (
            <span className="text-xs italic">Unassigned</span>
          )}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (c) => {
        if (!c.isAvailable) {
          return (
            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              Unavailable / Offline
            </span>
          );
        }
        if (c.activeParcels >= c.maxActiveParcels) {
          return (
            <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
              Full Capacity
            </span>
          );
        }
        return (
          <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Available
          </span>
        );
      },
    },
    {
      header: 'Active Deliveries',
      cell: (c) => (
        <span className="font-semibold text-ink">
          {c.activeParcels}{' '}
          <span className="font-normal text-muted text-xs">/ {c.maxActiveParcels}</span>
        </span>
      ),
    },
    {
      header: 'Capacity Utilization',
      className: 'px-4 py-3 min-w-[180px]',
      cell: (c) => {
        const pct = Math.min(
          100,
          Math.round((c.activeParcels / Math.max(1, c.maxActiveParcels)) * 100),
        );
        let barColor = 'bg-brand';
        if (pct >= 90) barColor = 'bg-red-500';
        else if (pct >= 60) barColor = 'bg-amber-500';

        return (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted">
              <span>{pct}% utilized</span>
              <span>{c.maxActiveParcels - c.activeParcels} slots free</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-line">
              <div
                className={`${barColor} h-2 rounded-full transition-all duration-300`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted uppercase">Fleet Couriers</p>
          <p className="text-2xl font-bold mt-1 text-ink">{totalCouriers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted uppercase">Available For Work</p>
          <p className="text-2xl font-bold mt-1 text-success">{availableCouriers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted uppercase">Active Deliveries</p>
          <p className="text-2xl font-bold mt-1 text-ink">{totalActiveParcels}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted uppercase">Fleet Utilization</p>
          <p className="text-2xl font-bold mt-1 text-brand">
            {totalCapacity > 0 ? Math.round((totalActiveParcels / totalCapacity) * 100) : 0}%
          </p>
        </Card>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-ink text-base">Courier Capacities & Status</h3>
        <Button
          variant="secondary"
          className="text-xs py-1 px-3"
          onClick={loadWorkload}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh List'}
        </Button>
      </div>

      <Table
        columns={columns}
        rows={couriers}
        rowKey={(c) => c.courierId}
        empty={
          <EmptyState
            title="No couriers found"
            description="No couriers with courier profiles have been registered in the system yet."
          />
        }
      />
    </div>
  );
}
