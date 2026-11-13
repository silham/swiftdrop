import { cn } from './cn';

/** Surface container. Pass `flush` to drop the padding when using CardHeader / CardBody. */
export function Card({
  className,
  flush = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-surface shadow-card',
        !flush && 'p-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  titleAs: Title = 'h2',
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  titleAs?: 'h2' | 'h3' | 'h4';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <Title className="text-sm font-semibold text-ink">{title}</Title>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-5 py-3 text-sm',
        'rounded-b-xl',
        className,
      )}
      {...props}
    />
  );
}
