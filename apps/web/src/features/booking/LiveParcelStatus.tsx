'use client';

import type { ParcelStatus } from '@swiftdrop/contracts';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { StatusBadge } from '@/components/ui';
import { useLiveTracking } from '@/features/tracking/useLiveTracking';

/** Re-renders the server page (timeline, proof photo) once the live status has moved on. */
function RefreshOnChange() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}

/**
 * Status badge for the customer's parcel page that follows the parcel live (SSE, with polling as a
 * fallback) using M4's tracking hook. When the status changes it asks Next to refresh the page so
 * the timeline and proof of delivery stay in step. Owner: M3.
 */
export function LiveParcelStatus({
  trackingNumber,
  status,
  updatedAt,
}: {
  trackingNumber: string;
  status: ParcelStatus;
  updatedAt: string;
}) {
  const live = useLiveTracking({
    trackingNumber,
    initialStatus: status,
    initialHistory: [],
    initialUpdatedAt: updatedAt,
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusBadge status={live.status} />
      {live.connectionState === 'live' && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden="true" />
          Live
        </span>
      )}
      {live.connectionState === 'polling' && (
        <span className="text-xs font-medium text-warning">Auto-refreshing</span>
      )}
      {/* Differs from the server-rendered status only after hydration, so useRouter is safe. */}
      {live.status !== status && <RefreshOnChange />}
    </span>
  );
}
