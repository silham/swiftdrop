'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, KeyValue, Modal, ProgressBar, Skeleton, cn } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { CourierWorkloadItem } from './CourierWorkload';
import { courierState, hasCapacity, utilisationPct } from './workload';

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

interface AssignCourierModalProps {
  parcel: AssignableParcel | null;
  onClose: () => void;
  onAssigned: () => void;
}

/** Owner: M7. Pick a courier (with live capacity) and POST /dispatch/assignments. */
export function AssignCourierModal({ parcel, onClose, onAssigned }: AssignCourierModalProps) {
  const [couriers, setCouriers] = useState<CourierWorkloadItem[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('');
  // The parent remounts this modal per parcel (key=parcel.id), so state starts fresh each time.
  const [loadingCouriers, setLoadingCouriers] = useState(parcel !== null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!parcel) return;

    let mounted = true;

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

  // Couriers with capacity first, then by lowest utilisation.
  const sorted = [...couriers].sort(
    (a, b) =>
      Number(hasCapacity(b)) - Number(hasCapacity(a)) || utilisationPct(a) - utilisationPct(b),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Assign Courier"
      titleAs="h3"
      size="lg"
      description={
        <>
          Select an available courier to handle delivery for parcel{' '}
          <span className="font-mono font-medium text-ink">{parcel.trackingNumber}</span>
        </>
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="assign-courier-form"
            disabled={submitting || !selectedCourierId || loadingCouriers}
          >
            {submitting ? 'Assigning...' : 'Confirm Assignment'}
          </Button>
        </>
      }
    >
      <form id="assign-courier-form" onSubmit={handleAssign} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <KeyValue
            columns={3}
            items={[
              {
                label: 'Origin / Pickup',
                value: (
                  <span className="capitalize">
                    {parcel.pickupCity} {parcel.pickupZoneName ? `(${parcel.pickupZoneName})` : ''}
                  </span>
                ),
              },
              {
                label: 'Destination',
                value: <span className="capitalize">{parcel.dropoffCity}</span>,
              },
              { label: 'Size & Weight', value: `${parcel.size} · ${parcel.weightKg} kg` },
            ]}
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Courier</legend>
          {loadingCouriers ? (
            <div className="space-y-2" aria-label="Loading courier workloads">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : couriers.length === 0 ? (
            <p className="text-sm text-muted">No couriers registered in the system.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {sorted.map((c) => {
                const disabled = !hasCapacity(c);
                const selected = c.courierId === selectedCourierId;
                const pct = utilisationPct(c);
                const state = courierState(c);
                return (
                  <li key={c.courierId}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition',
                        selected
                          ? 'border-brand bg-brand-soft/50 ring-2 ring-ring'
                          : 'border-line hover:border-line-strong hover:bg-surface-2',
                        disabled && 'cursor-not-allowed opacity-55 hover:bg-transparent',
                      )}
                    >
                      <input
                        type="radio"
                        name="courier"
                        value={c.courierId}
                        checked={selected}
                        disabled={disabled || submitting}
                        onChange={() => setSelectedCourierId(c.courierId)}
                        className="h-4 w-4 accent-brand"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-ink">{c.name}</span>
                          <Badge tone={state.tone} dot>
                            {state.label}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <ProgressBar
                            value={pct}
                            tone="auto"
                            size="sm"
                            label={`${c.name} capacity`}
                          />
                          <span className="shrink-0 text-xs text-muted tabular-nums">
                            {c.activeParcels}/{c.maxActiveParcels} active
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">{c.zoneName ?? 'Unassigned zone'}</p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
