import { cn } from './cn';

export interface ActivityItem {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  time?: React.ReactNode;
  /** Leading visual: an Avatar or an icon chip. */
  leading?: React.ReactNode;
}

/** Vertical feed with a connecting rule, for audit trails and recent activity. */
export function ActivityFeed({ items, className }: { items: ActivityItem[]; className?: string }) {
  return (
    <ol className={cn('relative space-y-4', className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3">
          {i < items.length - 1 && (
            <span
              className="absolute top-9 bottom-[-1rem] left-[17px] w-px bg-line"
              aria-hidden="true"
            />
          )}
          <div className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center">
            {item.leading}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="min-w-0 text-sm text-ink">{item.title}</p>
              {item.time && <span className="shrink-0 text-xs text-subtle">{item.time}</span>}
            </div>
            {item.description && <p className="mt-0.5 text-xs text-muted">{item.description}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
