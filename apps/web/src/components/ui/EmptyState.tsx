import { Inbox } from 'lucide-react';
import { cn } from './cn';

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact = false,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  /** Smaller variant for use inside cards and widgets. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface text-center',
        compact ? 'p-6' : 'p-10',
        className,
      )}
    >
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted [&_svg]:h-5 [&_svg]:w-5">
        {icon ?? <Inbox aria-hidden="true" />}
      </span>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
