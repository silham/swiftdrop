import { CircleCheck, Package, Truck } from 'lucide-react';
import { cn } from '@/components/ui';
import { formatNumber } from '@/lib/format';

/**
 * Today's counts for the courier home screen. Compact 3-up tiles that fit a 375px phone.
 * Pass `null` (the default) while the data isn't available. Owner: M6.
 */
export function CourierTodaySummary({
  assigned = null,
  outForDelivery = null,
  deliveredToday = null,
  className,
}: {
  assigned?: number | null;
  outForDelivery?: number | null;
  deliveredToday?: number | null;
  className?: string;
}) {
  const tiles = [
    { label: 'Assigned', value: assigned, Icon: Package, tone: 'bg-brand-soft text-brand' },
    {
      label: 'Out for delivery',
      value: outForDelivery,
      Icon: Truck,
      tone: 'bg-warning-soft text-warning',
    },
    {
      label: 'Delivered today',
      value: deliveredToday,
      Icon: CircleCheck,
      tone: 'bg-success-soft text-success',
    },
  ];
  return (
    <section aria-label="Today" className={cn('grid grid-cols-3 gap-2 sm:gap-4', className)}>
      {tiles.map(({ label, value, Icon, tone }) => (
        <div
          key={label}
          className="flex flex-col rounded-xl border border-line bg-surface p-3 shadow-card sm:p-4"
        >
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tone)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="mt-3 text-2xl font-semibold text-ink tabular-nums">{formatNumber(value)}</p>
          <p className="mt-0.5 text-xs leading-tight text-muted">{label}</p>
        </div>
      ))}
    </section>
  );
}
