import { canTransition, MAX_DELIVERY_ATTEMPTS, type ParcelStatus } from '@swiftdrop/contracts';
import { COURIER_SETTABLE } from './dto/courier.dto';

export type CourierSettableStatus = (typeof COURIER_SETTABLE)[number];

export interface CourierNextActions {
  /** Statuses the courier may set with PATCH /courier/parcels/:id/status. */
  statuses: CourierSettableStatus[];
  /** True when POST /courier/parcels/:id/proof (→ DELIVERED) is allowed. */
  canDeliver: boolean;
}

/**
 * What an assigned courier can do next. Mirrors the lifecycle graph (contracts) and the attempt
 * cap, so the UI never offers a button the API would reject. Owner: M6.
 */
export function nextCourierActions(
  status: ParcelStatus,
  deliveryAttempts: number,
): CourierNextActions {
  const statuses = COURIER_SETTABLE.filter((to) => {
    if (!canTransition(status, to)) return false;
    // A re-attempt (FAILED → OUT_FOR_DELIVERY) is capped.
    if (status === 'FAILED' && to === 'OUT_FOR_DELIVERY') {
      return deliveryAttempts < MAX_DELIVERY_ATTEMPTS;
    }
    return true;
  });
  return { statuses, canDeliver: canTransition(status, 'DELIVERED') };
}
