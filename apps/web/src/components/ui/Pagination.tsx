'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from './cn';

/**
 * "Showing 1–20 of 134" + prev/next. Use `hrefFor` for URL pagination (server pages) or
 * `onPageChange` for client state.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  hrefFor,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange?: (page: number) => void;
  hrefFor?: (page: number) => string;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    'inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink shadow-card transition hover:bg-surface-2 aria-disabled:pointer-events-none aria-disabled:opacity-40';

  function control(target: number, label: string, children: React.ReactNode) {
    const disabled = target < 1 || target > pages;
    if (hrefFor && !disabled) {
      return (
        <Link href={hrefFor(target)} className={btn} aria-label={label}>
          {children}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className={btn}
        aria-label={label}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => onPageChange?.(target)}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 text-xs text-muted',
        className,
      )}
    >
      <p className="tabular-nums">
        Showing <span className="font-medium text-ink">{from}</span>–
        <span className="font-medium text-ink">{to}</span> of{' '}
        <span className="font-medium text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {control(
          page - 1,
          'Previous page',
          <>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Prev
          </>,
        )}
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        {control(
          page + 1,
          'Next page',
          <>
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </>,
        )}
      </div>
    </div>
  );
}
