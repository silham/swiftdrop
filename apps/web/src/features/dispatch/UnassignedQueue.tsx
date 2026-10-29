'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  Select,
  StatusBadge,
  Table,
  type Column,
} from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { ParcelSize, ParcelStatus } from '@swiftdrop/contracts';
import { AssignCourierModal, type AssignableParcel } from './AssignCourierModal';

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

export function UnassignedQueue() {
  const [parcels, setParcels] = useState<UnassignedParcelRow[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [assignTarget, setAssignTarget] = useState<AssignableParcel | null>(null);

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

  async function loadParcels(targetZone = selectedZoneId, targetPage = page) {
    setLoading(true);
    setError(undefined);

    const query: { page: number; pageSize: number; zoneId?: string } = {
      page: targetPage,
      pageSize: 20,
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
    void loadParcels(selectedZoneId, page);
  }, [selectedZoneId, page]);

  function handleZoneChange(zoneId: string) {
    setSelectedZoneId(zoneId);
    setPage(1);
  }

  const columns: Column<UnassignedParcelRow>[] = [
    {
      header: 'Tracking Number',
      cell: (p) => <span className="font-mono font-medium text-ink">{p.trackingNumber}</span>,
    },
    {
      header: 'Status',
      cell: (p) => <StatusBadge status={p.status} />,
    },
    {
      header: 'Route (Pickup → Dropoff)',
      cell: (p) => (
        <div>
          <span className="font-medium capitalize">{p.pickupCity}</span>
          <span className="text-muted mx-1">→</span>
          <span className="font-medium capitalize">{p.dropoffCity}</span>
          {p.pickupZoneName && (
            <span className="block text-xs text-muted">Zone: {p.pickupZoneName}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Size & Weight',
      cell: (p) => (
        <span className="text-muted">
          {p.size} &middot; {p.weightKg} kg
        </span>
      ),
    },
    {
      header: 'Fee',
      cell: (p) => (
        <span className="font-medium">
          {p.currency} {(p.feeCents / 100).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Booked At',
      cell: (p) => (
        <span className="text-muted text-xs">
          {new Date(p.createdAt).toLocaleDateString()}{' '}
          {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      header: 'Action',
      cell: (p) => (
        <Button
          variant="secondary"
          className="text-xs py-1 px-3"
          onClick={() => setAssignTarget(p)}
        >
          Assign Courier
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface p-4 rounded-lg border border-line">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label htmlFor="zone-filter" className="text-sm font-medium text-muted whitespace-nowrap">
            Filter by Zone:
          </label>
          <Select
            id="zone-filter"
            value={selectedZoneId}
            onChange={(e) => handleZoneChange(e.target.value)}
            className="w-full sm:w-56 text-sm"
          >
            <option value="">All Serviced Zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} ({z.code})
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {total} parcel{total === 1 ? '' : 's'} awaiting courier assignment
          </span>
          <Button
            variant="ghost"
            className="text-xs py-1 px-2"
            onClick={() => loadParcels()}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        rows={parcels}
        rowKey={(p) => p.id}
        empty={
          <EmptyState
            title="No unassigned parcels"
            description={
              selectedZoneId
                ? 'There are currently no parcels in the selected zone awaiting assignment.'
                : 'All booked parcels have been assigned to couriers!'
            }
          />
        }
      />

      {assignTarget && (
        <AssignCourierModal
          parcel={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => loadParcels()}
        />
      )}
    </div>
  );
}
