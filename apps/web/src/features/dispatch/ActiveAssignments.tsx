'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Pagination,
  Skeleton,
  StatusBadge,
  Table,
  type Column,
} from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { formatRelative } from '@/lib/format';
import type { ParcelStatus } from '@swiftdrop/contracts';

interface AssignmentRow {
  id: string;
  parcelId: string;
  trackingNumber: string;
  parcelStatus: ParcelStatus;
  courierId: string;
  courierName: string;
  assignedAt: string;
  canUnassign: boolean;
}

const PAGE_SIZE = 10;

/**
 * Owner: M7. Parcels currently assigned to couriers, with an Unassign action for the ones that can
 * still be handed over (not yet on the road). `refreshKey` reloads the list when the queue above
 * changes; `onChanged` tells the queue and the workload panel to reload after an unassign.
 */
export function ActiveAssignments({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  // Reloads when the page changes or the parent bumps `refreshKey`. The flag drops a response that
  // arrives after a newer request was made.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: apiErr } = await api.GET('/api/v1/dispatch/assignments', {
        params: { query: { page, pageSize: PAGE_SIZE } },
      });
      if (cancelled) return;
      setLoading(false);
      if (apiErr || !data) {
        setError(errorMessage(apiErr, 'Failed to load active assignments'));
        return;
      }
      setError(undefined);
      setRows(data.data as unknown as AssignmentRow[]);
      setTotal(data.meta.total);
    })();
    return () => {
      cancelled = true;
    };
  }, [page, refreshKey]);

  async function unassign(row: AssignmentRow) {
    if (!window.confirm(`Take ${row.trackingNumber} back from ${row.courierName}?`)) return;
    setBusyId(row.id);
    setError(undefined);
    const { error: apiErr } = await api.DELETE('/api/v1/dispatch/assignments/{id}', {
      params: { path: { id: row.id } },
    });
    setBusyId(undefined);
    if (apiErr) {
      setError(errorMessage(apiErr, 'Could not unassign this parcel'));
      return;
    }
    onChanged();
  }

  const columns: Column<AssignmentRow>[] = [
    {
      header: 'Parcel',
      cell: (r) => (
        <span className="font-mono text-[13px] font-medium whitespace-nowrap text-ink">
          {r.trackingNumber}
        </span>
      ),
    },
    { header: 'Status', cell: (r) => <StatusBadge status={r.parcelStatus} /> },
    { header: 'Courier', cell: (r) => <span className="text-ink">{r.courierName}</span> },
    {
      header: 'Assigned',
      cell: (r) => <span className="text-muted">{formatRelative(r.assignedAt)}</span>,
    },
    {
      header: 'Actions',
      className: 'px-4 py-3 text-right',
      headerClassName: 'text-right',
      cell: (r) => (
        <Button
          variant="secondary"
          size="sm"
          disabled={!r.canUnassign || busyId === r.id}
          title={r.canUnassign ? undefined : 'Already on the road — it can no longer be unassigned'}
          aria-label={`Unassign ${r.trackingNumber}`}
          onClick={() => void unassign(r)}
        >
          {busyId === r.id ? 'Unassigning…' : 'Unassign'}
        </Button>
      ),
    },
  ];

  return (
    <Card flush>
      <CardHeader
        title="Active assignments"
        description={`${total} parcel${total === 1 ? '' : 's'} currently with couriers`}
      />
      {error && (
        <div className="px-5 pb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {loading ? (
        <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading assignments">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <Table
          bare
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          caption="Active assignments"
          empty={
            <div className="p-5">
              <EmptyState
                compact
                title="Nothing assigned right now"
                description="Parcels you assign to couriers show up here."
              />
            </div>
          }
        />
      )}
      {total > PAGE_SIZE && (
        <div className="border-t border-line px-5 py-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}
    </Card>
  );
}
