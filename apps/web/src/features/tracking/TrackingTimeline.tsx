'use client';

import type { ParcelStatus } from '@swiftdrop/contracts';
import { Check, TriangleAlert, Truck } from 'lucide-react';
import { Alert, cn, StatusBadge, STATUS_LABEL } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { TrackingHistoryItem } from './useLiveTracking';

export interface TrackingTimelineProps {
  currentStatus: ParcelStatus;
  history: TrackingHistoryItem[];
  originCity: string;
  destinationCity: string;
}

const ORDERED_STEPS: ParcelStatus[] = [
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

/** Owner: M4. Route card, progress stepper and status history. */
export function TrackingTimeline({
  currentStatus,
  history,
  originCity,
  destinationCity,
}: TrackingTimelineProps) {
  // Sort history newest first for the activity log
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  const isFailed = currentStatus === 'FAILED';
  // A FAILED parcel keeps the progress it made: show the furthest step it reached before failing.
  const currentIndex = isFailed
    ? Math.max(0, ...history.map((h) => ORDERED_STEPS.indexOf(h.status)))
    : ORDERED_STEPS.indexOf(currentStatus);
  const progress = (Math.max(0, currentIndex) / (ORDERED_STEPS.length - 1)) * 100;
  const reachedAt = (step: ParcelStatus) => history.find((h) => h.status === step)?.at;

  return (
    <div className="space-y-6">
      {/* Route header */}
      <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">
            Origin
          </span>
          <p className="text-base font-semibold text-ink capitalize">{originCity}</p>
        </div>
        <div className="flex flex-1 items-center gap-1.5 text-brand" aria-hidden="true">
          <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
          <span className="relative h-0.5 flex-1 overflow-hidden rounded bg-line">
            <span
              className={cn('absolute inset-y-0 left-0', isFailed ? 'bg-danger' : 'bg-brand')}
              style={{ width: `${progress}%` }}
            />
          </span>
          <Truck className={cn('h-5 w-5 shrink-0', isFailed && 'text-danger')} />
          <span className="h-0.5 w-6 shrink-0 rounded bg-line" />
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              currentStatus === 'DELIVERED' ? 'bg-success' : 'bg-line-strong',
            )}
          />
        </div>
        <div className="min-w-0 text-right">
          <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">
            Destination
          </span>
          <p className="text-base font-semibold text-ink capitalize">{destinationCity}</p>
        </div>
      </div>

      {/* Stepper Progress */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <h3 className="mb-6 text-sm font-semibold text-ink">Delivery Progress</h3>
        <ol className="relative grid grid-cols-5">
          <span
            className="absolute top-4 right-[10%] left-[10%] h-0.5 bg-line"
            aria-hidden="true"
          />
          <span
            className={cn('absolute top-4 left-[10%] h-0.5', isFailed ? 'bg-danger' : 'bg-brand')}
            style={{ width: `${progress * 0.8}%` }}
            aria-hidden="true"
          />
          {ORDERED_STEPS.map((step, idx) => {
            const isCompleted = currentIndex >= idx;
            const isCurrent = !isFailed && currentStatus === step;
            const at = reachedAt(step);
            return (
              <li key={step} className="relative z-10 flex flex-col items-center text-center">
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors',
                    isCurrent
                      ? 'bg-brand text-brand-fg ring-4 ring-brand-soft'
                      : isCompleted
                        ? 'bg-brand text-brand-fg'
                        : 'border-2 border-line-strong bg-surface text-muted',
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted && !isCurrent ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span
                  className={cn(
                    'mt-2 hidden text-xs sm:block',
                    isCurrent
                      ? 'font-semibold text-brand'
                      : isCompleted
                        ? 'font-medium text-ink'
                        : 'text-muted',
                  )}
                >
                  {STATUS_LABEL[step]}
                </span>
                {at && (
                  <span className="mt-0.5 hidden text-[11px] text-subtle md:block">
                    {formatDateTime(at)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {isFailed && (
          <Alert tone="error" className="mt-6" title="Delivery Exception">
            {sortedHistory[0]?.reason ? (
              <span>Reason: {sortedHistory[0].reason.replace(/_/g, ' ')}</span>
            ) : (
              <span>Attempt failed. Parcel will be re-attempted or held for pickup.</span>
            )}
          </Alert>
        )}
      </div>

      {/* Activity Timeline List */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <h3 className="mb-5 text-sm font-semibold text-ink">Status History</h3>
        {sortedHistory.length === 0 ? (
          <p className="text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <ol className="space-y-5">
            {sortedHistory.map((item, index) => (
              <li key={`${item.status}-${item.at}-${index}`} className="relative flex gap-4">
                {index < sortedHistory.length - 1 && (
                  <span
                    className="absolute top-7 bottom-[-1.25rem] left-[11px] w-px bg-line"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={cn(
                    'relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    index === 0 ? 'bg-brand-soft' : 'bg-surface-2',
                  )}
                >
                  {item.status === 'FAILED' ? (
                    <TriangleAlert className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                  ) : (
                    <span
                      className={cn('h-2 w-2 rounded-full', index === 0 ? 'bg-brand' : 'bg-subtle')}
                    />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    <time className="text-xs text-muted" dateTime={item.at}>
                      {formatDateTime(item.at)}
                    </time>
                  </div>
                  {item.reason && (
                    <p className="mt-1 text-xs font-medium text-danger">
                      Reason: {item.reason.replace(/_/g, ' ')}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
