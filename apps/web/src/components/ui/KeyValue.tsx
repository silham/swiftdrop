import { cn } from './cn';

export interface KeyValueItem {
  label: string;
  value: React.ReactNode;
}

/** Definition list for detail panels. */
export function KeyValue({
  items,
  columns = 1,
  className,
}: {
  items: KeyValueItem[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }[columns];
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', cols, className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
