import { CardHeader } from './Card';
import { cn } from './cn';
import { EmptyState } from './EmptyState';
import { Alert } from './Alert';
import { Skeleton } from './Skeleton';

/** Card wrapper for a chart or widget with built-in loading / empty / error states. */
export function ChartCard({
  title,
  description,
  actions,
  icon,
  titleAs,
  loading = false,
  error,
  empty,
  emptyTitle = 'No data yet',
  emptyDescription,
  minHeight = 220,
  className,
  bodyClassName,
  footer,
  flush = false,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  titleAs?: 'h2' | 'h3' | 'h4';
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  minHeight?: number;
  className?: string;
  bodyClassName?: string;
  footer?: React.ReactNode;
  /** Drop the body padding (for edge-to-edge tables). States keep their padding. */
  flush?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-xl border border-line bg-surface shadow-card',
        className,
      )}
    >
      <CardHeader
        title={title}
        description={description}
        actions={actions}
        icon={icon}
        titleAs={titleAs}
      />
      <div
        className={cn(
          'flex-1',
          flush && !loading && !error && !empty ? 'p-0' : 'p-5',
          bodyClassName,
        )}
        style={{ minHeight }}
      >
        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <Alert tone="error">{error}</Alert>
        ) : empty ? (
          <EmptyState
            compact
            title={emptyTitle}
            description={emptyDescription}
            className="border-0"
          />
        ) : (
          children
        )}
      </div>
      {footer && (
        <div className="rounded-b-xl border-t border-line px-5 py-3 text-sm">{footer}</div>
      )}
    </section>
  );
}
