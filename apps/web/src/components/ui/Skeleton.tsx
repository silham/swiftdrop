import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-line', className)} aria-hidden="true" />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
