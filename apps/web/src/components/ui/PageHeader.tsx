import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  breadcrumbs,
  meta,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small label above the title, e.g. the section name. */
  eyebrow?: string;
  breadcrumbs?: Crumb[];
  /** Extra inline content after the title, e.g. a status badge. */
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-6 space-y-3">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-subtle" aria-hidden="true" />}
                {c.href ? (
                  <Link href={c.href} className="hover:text-ink">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-ink">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-xs font-semibold tracking-wider text-brand uppercase">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            {meta}
          </div>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
