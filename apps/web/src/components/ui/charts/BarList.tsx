import Link from 'next/link';
import { cn } from '../cn';

export interface BarListItem {
  key: string;
  label: React.ReactNode;
  value: number;
  /** Shown right of the value, e.g. "92% success". */
  secondary?: React.ReactNode;
  href?: string;
}

/** Ranked horizontal bars (leaderboards, top zones). Pure HTML, server-safe. */
export function BarList({
  items,
  valueFormatter = (v) => v.toLocaleString(),
  color = 'bg-brand/15',
  className,
}: {
  items: BarListItem[];
  valueFormatter?: (v: number) => string;
  /** Tailwind background class for the bar. */
  color?: string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn('space-y-1.5', className)}>
      {items.map((item) => {
        const inner = (
          <>
            <span
              className={cn('absolute inset-y-0 left-0 rounded-md', color)}
              style={{ width: `${(item.value / max) * 100}%` }}
              aria-hidden="true"
            />
            <span className="relative min-w-0 truncate text-ink">{item.label}</span>
            <span className="relative flex shrink-0 items-baseline gap-2 tabular-nums">
              <span className="font-medium text-ink">{valueFormatter(item.value)}</span>
              {item.secondary && <span className="text-xs text-muted">{item.secondary}</span>}
            </span>
          </>
        );
        const classes =
          'relative flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm';
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className={cn(classes, 'hover:bg-surface-2')}>
                {inner}
              </Link>
            ) : (
              <div className={classes}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
