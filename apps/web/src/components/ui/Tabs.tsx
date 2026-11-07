'use client';

import Link from 'next/link';
import { cn } from './cn';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
  /** Link mode: render as <Link>, so the filter lives in the URL. */
  href?: string;
}

/**
 * Filter tabs. Pass `href` on items for URL-driven filters (renders links with aria-current),
 * or `onChange` for local state (renders buttons with aria-pressed).
 */
export function Tabs({
  items,
  value,
  onChange,
  variant = 'pills',
  label = 'Filter',
  className,
}: {
  items: TabItem[];
  value: string;
  onChange?: (value: string) => void;
  variant?: 'pills' | 'underline';
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'flex max-w-full items-center overflow-x-auto',
        variant === 'pills'
          ? 'gap-1 rounded-lg border border-line bg-surface-2 p-1'
          : 'gap-4 border-b border-line',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        const classes = cn(
          'inline-flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap transition',
          variant === 'pills'
            ? cn(
                'rounded-md px-3 py-1.5',
                active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
              )
            : cn(
                '-mb-px border-b-2 px-1 pb-2.5',
                active
                  ? 'border-brand text-ink'
                  : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
              ),
        );
        const count = item.count != null && (
          <span
            className={cn(
              'rounded-full px-1.5 text-[11px] tabular-nums',
              active ? 'bg-brand-soft text-brand-dark' : 'bg-line text-muted',
            )}
          >
            {item.count}
          </span>
        );
        return item.href ? (
          <Link
            key={item.value}
            href={item.href}
            className={classes}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
            {count}
          </Link>
        ) : (
          <button
            key={item.value}
            type="button"
            className={classes}
            aria-pressed={active}
            onClick={() => onChange?.(item.value)}
          >
            {item.label}
            {count}
          </button>
        );
      })}
    </div>
  );
}
