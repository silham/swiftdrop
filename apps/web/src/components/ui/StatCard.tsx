import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from './cn';
import { Skeleton } from './Skeleton';
import { Sparkline } from './charts/Sparkline';

type Tone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'violet' | 'neutral';

const iconTones: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  violet: 'bg-violet-soft text-violet',
  neutral: 'bg-surface-2 text-muted',
};

const sparkColor: Record<Tone, string> = {
  brand: 'var(--sd-chart-1)',
  info: 'var(--sd-chart-2)',
  success: 'var(--sd-chart-3)',
  warning: 'var(--sd-warning)',
  danger: 'var(--sd-chart-4)',
  violet: 'var(--sd-chart-5)',
  neutral: 'var(--sd-subtle)',
};

/**
 * KPI tile: label, big value, optional icon, delta, hint and sparkline.
 * `delta` is a signed number shown as a percentage change; set `deltaGood="down"` when lower is better.
 */
export function StatCard({
  label,
  value,
  icon,
  tone = 'brand',
  hint,
  delta,
  deltaGood = 'up',
  trend,
  href,
  loading = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  hint?: React.ReactNode;
  delta?: number | null;
  deltaGood?: 'up' | 'down';
  trend?: number[];
  href?: string;
  loading?: boolean;
  className?: string;
}) {
  const hasDelta = delta != null && Number.isFinite(delta);
  const good = hasDelta && (deltaGood === 'up' ? delta! >= 0 : delta! <= 0);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4',
              iconTones[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      )}
      <div className="mt-2 flex min-h-5 items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          {hasDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium',
                good ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
              )}
            >
              {delta! >= 0 ? (
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
              )}
              {Math.abs(delta!).toFixed(1).replace(/\.0$/, '')}%
            </span>
          )}
          {hint && <span className="truncate text-muted">{hint}</span>}
        </div>
        {trend && trend.length > 1 && (
          <Sparkline data={trend} color={sparkColor[tone]} className="h-8 w-20 shrink-0" />
        )}
      </div>
    </>
  );
  const classes = cn(
    'group relative block rounded-xl border border-line bg-surface p-4 shadow-card',
    href && 'transition hover:border-line-strong hover:shadow-md',
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
        <ArrowRight
          className="absolute right-3 bottom-3 h-3.5 w-3.5 text-subtle opacity-0 transition group-hover:opacity-100"
          aria-hidden="true"
        />
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}

/** Responsive KPI row. */
export function StatGrid({
  className,
  cols = 4,
  children,
}: {
  className?: string;
  cols?: 3 | 4 | 5;
  children: React.ReactNode;
}) {
  const colClass = { 3: 'lg:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5' }[cols];
  return <div className={cn('grid gap-4 sm:grid-cols-2', colClass, className)}>{children}</div>;
}
