'use client';

import type { ParcelStatus } from '@swiftdrop/contracts';
import { StatusBadge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { TrackingTimeline } from './TrackingTimeline';
import { useLiveTracking, type TrackingHistoryItem } from './useLiveTracking';

export interface TrackingViewProps {
  trackingNumber: string;
  initialStatus: ParcelStatus;
  initialHistory: TrackingHistoryItem[];
  initialUpdatedAt: string;
  originCity: string;
  destinationCity: string;
}

/** Owner: M4. Live tracking summary + progress + history. */
export function TrackingView({
  trackingNumber,
  initialStatus,
  initialHistory,
  initialUpdatedAt,
  originCity,
  destinationCity,
}: TrackingViewProps) {
  const { status, history, updatedAt, connectionState } = useLiveTracking({
    trackingNumber,
    initialStatus,
    initialHistory,
    initialUpdatedAt,
  });

  return (
    <div className="space-y-6">
      {/* Live tracking banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">Current status</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <StatusBadge status={status} className="px-3 py-1 text-sm" />
            <span className="font-mono text-sm font-semibold tracking-wide text-ink">
              {trackingNumber}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-1 text-xs text-muted sm:items-end">
          {connectionState === 'live' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 font-medium text-success">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
              Live Updates Active
            </span>
          )}
          {connectionState === 'polling' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 font-medium text-warning">
              <span className="h-2 w-2 rounded-full bg-warning" />
              Auto-refreshing (Polling)
            </span>
          )}
          {connectionState === 'connecting' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1">
              <span className="h-2 w-2 animate-ping rounded-full bg-muted" />
              Connecting...
            </span>
          )}
          <span>Updated {formatDateTime(updatedAt)}</span>
        </div>
      </div>

      <TrackingTimeline
        currentStatus={status}
        history={history}
        originCity={originCity}
        destinationCity={destinationCity}
      />
    </div>
  );
}
