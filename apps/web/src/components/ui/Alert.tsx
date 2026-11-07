import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from './cn';

const tones = {
  info: { box: 'border-info/25 bg-info-soft text-ink', icon: 'text-info', Icon: Info },
  success: {
    box: 'border-success/25 bg-success-soft text-ink',
    icon: 'text-success',
    Icon: CircleCheck,
  },
  warning: {
    box: 'border-warning/30 bg-warning-soft text-ink',
    icon: 'text-warning',
    Icon: TriangleAlert,
  },
  error: {
    box: 'border-danger/25 bg-danger-soft text-ink',
    icon: 'text-danger',
    Icon: CircleAlert,
  },
};

export function Alert({
  tone = 'info',
  title,
  action,
  className,
  children,
}: {
  tone?: keyof typeof tones;
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const { box, icon, Icon } = tones[tone];
  return (
    <div
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', box, className)}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5 text-muted')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
