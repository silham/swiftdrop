import type { ParcelStatus } from '@swiftdrop/contracts';
import { Badge, type BadgeTone } from './Badge';

export const STATUS_TONE: Record<ParcelStatus, BadgeTone> = {
  CREATED: 'neutral',
  PICKED_UP: 'violet',
  IN_TRANSIT: 'info',
  OUT_FOR_DELIVERY: 'warning',
  DELIVERED: 'success',
  FAILED: 'danger',
};

export const STATUS_LABEL: Record<ParcelStatus, string> = {
  CREATED: 'Created',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery failed',
};

export function StatusBadge({ status, className }: { status: ParcelStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
