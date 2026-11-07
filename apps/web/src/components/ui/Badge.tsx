import { cn } from './cn';

export type BadgeTone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'violet';

export const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted ring-line-strong',
  brand: 'bg-brand-soft text-brand-dark ring-brand/25',
  info: 'bg-info-soft text-info ring-info/25',
  success: 'bg-success-soft text-success ring-success/25',
  warning: 'bg-warning-soft text-warning ring-warning/25',
  danger: 'bg-danger-soft text-danger ring-danger/25',
  violet: 'bg-violet-soft text-violet ring-violet/25',
};

const dotTones: Record<BadgeTone, string> = {
  neutral: 'bg-subtle',
  brand: 'bg-brand',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  violet: 'bg-violet',
};

/** Small label for statuses, roles, kinds. Use tones, never palette classes. */
export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        badgeTones[tone],
        className,
      )}
    >
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', dotTones[tone])} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
