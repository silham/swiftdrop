import { cn } from '@/components/ui';

/**
 * Big primary/secondary actions for a delivery. On phones it sticks above the courier bottom tab
 * bar so the main action is always under the thumb; from md up it sits inline. Owner: M6.
 * Pass kit <Button size="lg"> elements (or links styled with buttonClasses).
 */
export function ActionBar({
  primary,
  secondary,
  note,
  className,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      {/* reserve space on phones so the fixed bar never covers content */}
      <div className={cn(note ? 'h-36' : 'h-24', 'md:hidden')} aria-hidden="true" />
      <div
        className={cn(
          'fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur',
          'md:static md:rounded-xl md:border md:bg-surface md:px-5 md:py-4 md:shadow-card',
          className,
        )}
      >
        {note && <p className="mb-2 text-center text-xs text-muted md:text-left">{note}</p>}
        <div
          className={cn(
            'grid gap-2 md:flex md:justify-end md:[&>*]:w-auto',
            secondary ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          {secondary}
          {primary}
        </div>
      </div>
    </>
  );
}
