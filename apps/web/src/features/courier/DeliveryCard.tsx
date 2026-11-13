import type { ParcelStatus } from '@swiftdrop/contracts';
import { ChevronRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui';

/**
 * One assigned parcel as a large touch target (whole card is the link). Owner: M6.
 * Shows only what a courier needs at a glance: tracking number, status, where to go.
 */
export function DeliveryCard({
  href,
  trackingNumber,
  status,
  recipientName,
  address,
  city,
  meta,
}: {
  href: string;
  trackingNumber: string;
  status: ParcelStatus;
  recipientName?: string;
  address?: string;
  city: string;
  /** Small trailing detail, e.g. "Assigned 10:24" or "2.5 kg · Small". */
  meta?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-20 items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition hover:border-line-strong active:bg-surface-2"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-ink">{trackingNumber}</span>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <div className="min-w-0">
            {recipientName && <p className="truncate font-medium text-ink">{recipientName}</p>}
            <p className="truncate text-muted">
              {address ? `${address}, ` : ''}
              <span className="capitalize">{city}</span>
            </p>
          </div>
        </div>
        {meta && <p className="text-xs text-subtle">{meta}</p>}
      </div>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-ink"
        aria-hidden="true"
      />
    </Link>
  );
}
