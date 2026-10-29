'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, FormField, Select } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';

export interface AssignableParcel {
  id: string;
  trackingNumber: string;
  pickupCity: string;
  dropoffCity: string;
  size: string;
  weightKg: number;
  pickupZoneId: string | null;
  pickupZoneName?: string | null;
}

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

interface AssignCourierModalProps {
  parcel: AssignableParcel | null;
  onClose: () => void;
  onAssigned: () => void;
}

export function AssignCourierModal({ parcel, onClose, onAssigned }: AssignCourierModalProps) {
  const [couriers, setCouriers] = useState<CourierWorkloadItem[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('');
  const [loadingCouriers, setLoadingCouriers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!parcel) return;

    let mounted = true;
    setLoadingCouriers(true);
    setError(undefined);

    async function fetchCouriers() {
      const { data, error: apiErr } = await api.GET('/api/v1/dispatch/couriers/workload');
      if (!mounted) return;
      setLoadingCouriers(false);

      if (apiErr || !data) {
        setError(errorMessage(apiErr, 'Failed to load couriers'));
        return;
      }

      setCouriers(data);
      // Auto-select first available courier that has remaining capacity
      const firstAvailable = data.find(
        (c) => c.isAvailable && c.activeParcels < c.maxActiveParcels,
      );
      if (firstAvailable) {
        setSelectedCourierId(firstAvailable.courierId);
      }
    }

    void fetchCouriers();

    return () => {
      mounted = false;
    };
  }, [parcel]);

  if (!parcel) return null;

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCourierId) {
      setError('Please select a courier');
      return;
    }

    setSubmitting(true);
    setError(undefined);

    const { error: apiErr } = await api.POST('/api/v1/dispatch/assignments', {
      body: {
        parcelId: parcel!.id,
        courierId: selectedCourierId,
      },
    });

    setSubmitting(false);

    if (apiErr) {
      setError(errorMessage(apiErr, 'Failed to assign parcel'));
      return;
    }

    onAssigned();
    onClose();
  }

  const selectedCourier = couriers.find((c) => c.courierId === selectedCourierId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div>
            <h3 className="text-lg font-semibold text-ink">Assign Courier</h3>
            <p className="text-sm text-muted">
              Select an available courier to handle delivery for parcel{' '}
              <span className="font-mono font-medium text-ink">{parcel.trackingNumber}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink text-xl font-bold"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        <div className="mt-4 rounded-lg bg-canvas p-3 text-xs space-y-1 border border-line">
          <div className="flex justify-between">
            <span className="text-muted">Origin / Pickup:</span>
            <span className="font-medium text-ink capitalize">
              {parcel.pickupCity} {parcel.pickupZoneName ? `(${parcel.pickupZoneName})` : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Destination:</span>
            <span className="font-medium text-ink capitalize">{parcel.dropoffCity}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Size & Weight:</span>
            <span className="font-medium text-ink">
              {parcel.size} &middot; {parcel.weightKg} kg
            </span>
          </div>
        </div>

        <form onSubmit={handleAssign} className="mt-5 space-y-4">
          <FormField
            label="Courier"
            htmlFor="courier-select"
            help={
              loadingCouriers
                ? 'Loading courier workloads...'
                : couriers.length === 0
                  ? 'No couriers registered in the system.'
                  : undefined
            }
          >
            <Select
              id="courier-select"
              value={selectedCourierId}
              onChange={(e) => setSelectedCourierId(e.target.value)}
              disabled={loadingCouriers || submitting}
            >
              <option value="">-- Choose Courier --</option>
              {couriers.map((c) => {
                const isFull = c.activeParcels >= c.maxActiveParcels;
                const statusTag = !c.isAvailable
                  ? ' [Unavailable]'
                  : isFull
                    ? ' [Full Capacity]'
                    : '';
                const zoneTag = c.zoneName ? ` (${c.zoneName})` : '';
                return (
                  <option key={c.courierId} value={c.courierId} disabled={!c.isAvailable || isFull}>
                    {c.name}
                    {zoneTag} — {c.activeParcels}/{c.maxActiveParcels} active{statusTag}
                  </option>
                );
              })}
            </Select>
          </FormField>

          {selectedCourier && (
            <div className="rounded-md border border-line p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted">Active Workload:</span>
                <span className="font-medium">
                  {selectedCourier.activeParcels} / {selectedCourier.maxActiveParcels} parcels
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Zone:</span>
                <span className="font-medium">{selectedCourier.zoneName ?? 'Unassigned zone'}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                <div
                  className="bg-brand h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (selectedCourier.activeParcels / selectedCourier.maxActiveParcels) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-line">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !selectedCourierId || loadingCouriers}>
              {submitting ? 'Assigning...' : 'Confirm Assignment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
