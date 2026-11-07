import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg shadow-card hover:bg-brand-hover',
  secondary: 'border border-line-strong bg-surface text-ink shadow-card hover:bg-surface-2',
  outline: 'border border-brand/50 text-brand hover:bg-brand-soft',
  danger: 'bg-danger text-danger-fg shadow-card hover:opacity-90',
  ghost: 'text-brand hover:bg-brand-soft',
  subtle: 'text-muted hover:bg-surface-2 hover:text-ink',
};

const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
  icon: 'h-9 w-9 p-0',
};

/** Class string for links styled as buttons: <Link className={buttonClasses({ variant: 'secondary' })}>. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses({ variant, size, className })} {...props} />;
}
