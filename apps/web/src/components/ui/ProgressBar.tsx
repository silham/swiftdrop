import { cn } from './cn';

type Tone = 'auto' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const fills: Record<Exclude<Tone, 'auto'>, string> = {
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

/**
 * Horizontal meter. `value` is 0–100. tone="auto" turns warning above 60 and danger above 90
 * (capacity style); use "success" for "higher is better" metrics.
 */
export function ProgressBar({
  value,
  tone = 'brand',
  label,
  size = 'md',
  className,
}: {
  value: number;
  tone?: Tone;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const resolved = tone === 'auto' ? (v > 90 ? 'danger' : v > 60 ? 'warning' : 'success') : tone;
  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-line ring-inset',
        size === 'sm' ? 'h-1.5' : 'h-2',
        className,
      )}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-[width]', fills[resolved])}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
