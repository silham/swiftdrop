'use client';

import { ArrowRight, CircleCheck, Gauge, Inbox, Package, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardFooter,
  CardHeader,
  EmptyState,
  Pagination,
  ProgressBar,
  Select,
  Skeleton,
  StatCard,
  StatGrid,
  StatusBadge,
  Table,
  Toolbar,
  type Column,
} from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { formatMoney, formatRelative } from '@/lib/format';
import type { ParcelSize, ParcelStatus } from '@swiftdrop/contracts';
import { AssignCourierModal, type AssignableParcel } from './AssignCourierModal';
import { hasCapacity, summariseFleet, useCourierWorkload, utilisationPct } from './workload';

export interface UnassignedParcelRow {
  id: string;
  trackingNumber: string;
  status: ParcelStatus;
  pickupZoneId: string | null;
  pickupZoneName?: string | null;
  pickupCity: string;
  dropoffCity: string;
  size: ParcelSize;
  weightKg: number;
  feeCents: number;
  currency: string;
  createdAt: string;
}

interface ZoneOption {
  id: string;
  name: string;
  code: string;
}

const PAGE_SIZE = 20;

/** Owner: M7. Dispatch dashboard: fleet KPIs, unassigned queue and available couriers. */
export function UnassignedQueue() {
  const [parcels, setParcels] = useState<UnassignedParcelRow[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [assignTarget, setAssignTarget] = useState<AssignableParcel | null>(null);
  const workload = useCourierWorkload();
  const fleet = summariseFleet(workload.couriers);

  // Load available zones for filtering
  useEffect(() => {
    async function loadZones() {
      const { data } = await api.GET('/api/v1/admin/zones');
      if (data) {
        setZones(data.filter((z) => z.isActive));
      }
    }
    void loadZones();
  }, []);

  /** For buttons and after edits: show the spinner, then reload. */
  async function loadParcels(targetZone = selectedZoneId, targetPage = page) {
    setLoading(true);
    setError(undefined);
    await fetchParcels(targetZone, targetPage);
  }

  /** Fetches and stores the data. Only sets state after the request, so effects can call it. */
  async function fetchParcels(targetZone = selectedZoneId, targetPage = page) {
    const query: { page: number; pageSize: number; zoneId?: string } = {
      page: targetPage,
      pageSize: PAGE_SIZE,
    };
    if (targetZone) query.zoneId = targetZone;

    const { data, error: apiErr } = await api.GET('/api/v1/dispatch/unassigned', {
      params: { query },
    });

    setLoading(false);

    if (apiErr || !data) {
      setError(errorMessage(apiErr, 'Failed to fetch unassigned parcels'));
      return;
    }

    setParcels(data.data);
    setTotal(data.meta.total);
  }

  useEffect(() => {
    void fetchParcels(selectedZoneId, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the filter or page changes
  }, [selectedZoneId, page]);

  function handleZoneChange(zoneId: string) {
    setLoading(true);
    setSelectedZoneId(zoneId);
    setPage(1);
  }

  function handlePageChange(next: number) {
    setLoading(true);
    setPage(next);
  }

  function refreshAll() {
    void loadParcels();
    workload.reload();
  }

  const columns: Column<UnassignedParcelRow>[] = [
    {
      header: 'Parcel',
      cell: (p) => (
        <div className="whitespace-nowrap">
          <span className="font-mono text-[13px] font-medium text-ink">{p.trackingNumber}</span>
          <span className="block text-xs text-muted">
            {p.size} &middot; {p.weightKg} kg
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (p) => <StatusBadge status={p.status} />,
    },
    {
      header: 'Route',
      cell: (p) => (
        <div className="whitespace-nowrap">
          <span className="font-medium text-ink capitalize">{p.pickupCity}</span>
          <ArrowRight className="mx-1 inline h-3 w-3 text-subtle" aria-label="to" />
          <span className="font-medium text-ink capitalize">{p.dropoffCity}</span>
          {p.pickupZoneName && (
            <span className="block text-xs text-muted">Zone: {p.pickupZoneName}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Fee',
      headerClassName: 'text-right',
      className: 'px-4 py-3 text-right whitespace-nowrap',
      cell: (p) => (
        <span className="font-medium text-ink tabular-nums">
          {formatMoney(p.feeCents, p.currency)}
        </span>
      ),
    },
    {
      header: 'Age',
      cell: (p) => (
        <time
          dateTime={p.createdAt}
          title={new Date(p.createdAt).toLocaleString()}
          className="text-xs whitespace-nowrap text-muted"
        >
          {formatRelative(p.createdAt)}
        </time>
      ),
    },
    {
      header: 'Action',
      headerClassName: 'text-right',
      className: 'px-4 py-3 text-right whitespace-nowrap',
      cell: (p) => (
        <Button variant="secondary" size="sm" onClick={() => setAssignTarget(p)}>
          Assign Courier
        </Button>
      ),
    },
  ];

  const available = workload.couriers
    .filter(hasCapacity)
    .sort((a, b) => utilisationPct(a) - utilisationPct(b));
  const workloadLoading = workload.loading && workload.couriers.length === 0;

  return (
    <div className="space-y-6">
      <StatGrid>
        <StatCard
          label="Unassigned"
          value={total}
          icon={<Inbox />}
          tone={total > 0 ? 'warning' : 'success'}
          loading={loading && parcels.length === 0 && total === 0}
          hint={selectedZoneId ? 'In the selected zone' : 'Awaiting a courier'}
        />
        <StatCard
          label="Available couriers"
          value={fleet.available}
          icon={<CircleCheck />}
          tone="success"
          loading={workloadLoading}
          hint={`of ${fleet.total} in the fleet`}
          href="/dispatch/couriers"
        />
        <StatCard
          label="Active deliveries"
          value={fleet.active}
          icon={<Package />}
          tone="brand"
          loading={workloadLoading}
          hint={`${fleet.capacity} slots total`}
        />
        <StatCard
          label="Fleet utilisation"
          value={`${fleet.utilisation}%`}
          icon={<Gauge />}
          tone={fleet.utilisation > 90 ? 'danger' : fleet.utilisation > 60 ? 'warning' : 'violet'}
          loading={workloadLoading}
          hint="Active parcels ÷ capacity"
        />
      </StatGrid>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card flush className="min-w-0">
          <CardHeader
            title="Assignment queue"
            description={`${total} parcel${total === 1 ? '' : 's'} awaiting courier assignment`}
          />
          <div className="border-b border-line px-5 py-3">
            <Toolbar
              end={
                <Button variant="secondary" size="sm" onClick={refreshAll} disabled={loading}>
                  <RefreshCw
                    className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
                    aria-hidden="true"
                  />
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
              }
            >
              <label
                htmlFor="zone-filter"
                className="text-sm font-medium whitespace-nowrap text-muted"
              >
                Filter by Zone:
              </label>
              <Select
                id="zone-filter"
                value={selectedZoneId}
                onChange={(e) => handleZoneChange(e.target.value)}
                className="w-full text-sm sm:w-56"
              >
                <option value="">All Serviced Zones</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} ({z.code})
                  </option>
                ))}
              </Select>
            </Toolbar>
          </div>

          {error && (
            <div className="px-5 pt-4">
              <Alert tone="error">{error}</Alert>
            </div>
          )}

          {loading && parcels.length === 0 ? (
            <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table
              bare
              columns={columns}
              rows={parcels}
              rowKey={(p) => p.id}
              empty={
                <div className="p-5">
                  <EmptyState
                    compact
                    className="border-0"
                    icon={<CircleCheck />}
                    title="No unassigned parcels"
                    description={
                      selectedZoneId
                        ? 'There are currently no parcels in the selected zone awaiting assignment.'
                        : 'All booked parcels have been assigned to couriers!'
                    }
                  />
                </div>
              }
            />
          )}

          {total > PAGE_SIZE && (
            <CardFooter>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={handlePageChange}
                className="w-full"
              />
            </CardFooter>
          )}
        </Card>

        <Card flush className="flex flex-col self-start">
          <CardHeader
            title="Couriers available now"
            description="Online couriers with free capacity, least busy first."
          />
          <div className="flex-1 p-5">
            {workload.error ? (
              <Alert tone="error">{workload.error}</Alert>
            ) : workloadLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : available.length === 0 ? (
              <EmptyState
                compact
                className="border-0"
                title="No couriers free"
                description="Every courier is offline or at full capacity."
              />
            ) : (
              <ul className="space-y-4">
                {available.slice(0, 6).map((c) => {
                  const pct = utilisationPct(c);
                  return (
                    <li key={c.courierId} className="flex items-center gap-3">
                      <Avatar name={c.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                          <span className="shrink-0 text-xs text-muted tabular-nums">
                            {c.activeParcels}/{c.maxActiveParcels}
                          </span>
                        </div>
                        <ProgressBar
                          value={pct}
                          tone="auto"
                          size="sm"
                          label={`${c.name} capacity`}
                          className="mt-1.5"
                        />
                        <p className="mt-1 truncate text-xs text-muted">
                          {c.zoneName ?? 'Unassigned zone'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <CardFooter>
            <Link
              href="/dispatch/couriers"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              View courier workload <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </CardFooter>
        </Card>
      </div>

      {assignTarget && (
        <AssignCourierModal
          key={assignTarget?.id ?? 'none'}
          parcel={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={refreshAll}
        />
      )}
    </div>
  );
}
