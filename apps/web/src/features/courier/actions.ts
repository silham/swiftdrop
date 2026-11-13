import type { ParcelStatus } from '@swiftdrop/contracts';

export type CourierSettableStatus = 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'FAILED';

export interface CourierActionPlan {
  /** The main button: a plain status change, or "Mark delivered" (opens the proof form). */
  primary:
    { kind: 'status'; to: CourierSettableStatus; label: string } | { kind: 'deliver' } | null;
  /** True when the "Report a problem" button should be shown. */
  canFail: boolean;
}

const LABELS: Record<Exclude<CourierSettableStatus, 'FAILED'>, string> = {
  PICKED_UP: 'Mark picked up',
  IN_TRANSIT: 'Mark in transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
};

/**
 * Which buttons to show for a parcel. The API already says what is allowed next (`nextStatuses`,
 * `canDeliver`), so this only decides layout and wording. Owner: M6.
 */
export function planCourierActions(
  current: ParcelStatus,
  nextStatuses: readonly CourierSettableStatus[],
  canDeliver: boolean,
): CourierActionPlan {
  const canFail = nextStatuses.includes('FAILED');
  if (canDeliver) return { primary: { kind: 'deliver' }, canFail };

  const next = nextStatuses.find(
    (s): s is Exclude<CourierSettableStatus, 'FAILED'> => s !== 'FAILED',
  );
  if (!next) return { primary: null, canFail };

  const label =
    current === 'FAILED' && next === 'OUT_FOR_DELIVERY' ? 'Re-attempt delivery' : LABELS[next];
  return { primary: { kind: 'status', to: next, label }, canFail };
}
