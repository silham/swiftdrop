'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BadgeTone } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { CourierWorkloadItem } from './CourierWorkload';

/** Owner: M7. Fleet totals and per-courier capacity helpers shared by the dispatch widgets. */
export function utilisationPct(c: Pick<CourierWorkloadItem, 'activeParcels' | 'maxActiveParcels'>) {
  return Math.min(100, Math.round((c.activeParcels / Math.max(1, c.maxActiveParcels)) * 100));
}

export function courierState(c: CourierWorkloadItem): { label: string; tone: BadgeTone } {
  if (!c.isAvailable) return { label: 'Unavailable / Offline', tone: 'neutral' };
  if (c.activeParcels >= c.maxActiveParcels) return { label: 'Full Capacity', tone: 'danger' };
  return { label: 'Available', tone: 'success' };
}

export function hasCapacity(c: CourierWorkloadItem) {
  return c.isAvailable && c.activeParcels < c.maxActiveParcels;
}

export function summariseFleet(couriers: CourierWorkloadItem[]) {
  const active = couriers.reduce((acc, c) => acc + c.activeParcels, 0);
  const capacity = couriers.reduce((acc, c) => acc + c.maxActiveParcels, 0);
  return {
    total: couriers.length,
    available: couriers.filter(hasCapacity).length,
    active,
    capacity,
    utilisation: capacity > 0 ? Math.round((active / capacity) * 100) : 0,
  };
}

/** Loads GET /api/v1/dispatch/couriers/workload; `reload` shows the spinner again. */
export function useCourierWorkload() {
  const [couriers, setCouriers] = useState<CourierWorkloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const [version, setVersion] = useState(0);

  // Only sets state after the request resolves; `version` bumps trigger a reload.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data, error: apiErr } = await api.GET('/api/v1/dispatch/couriers/workload');
      if (!mounted) return;
      setLoading(false);
      if (apiErr || !data) {
        setError(errorMessage(apiErr, 'Failed to load courier workloads'));
        return;
      }
      setError(undefined);
      setCouriers(data);
    })();
    return () => {
      mounted = false;
    };
  }, [version]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setVersion((v) => v + 1);
  }, []);

  return { couriers, loading, error, reload };
}
