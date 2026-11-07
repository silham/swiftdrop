import { cn } from './cn';

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Classes for the <th>, e.g. 'text-right'. */
  headerClassName?: string;
}

/** Responsive data table. Pass `empty` to render when there are no rows. */
export function Table<T>({
  columns,
  rows,
  rowKey,
  empty,
  dense = false,
  bare = false,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: React.ReactNode;
  dense?: boolean;
  /** No outer border/rounding: use inside a Card. */
  bare?: boolean;
  caption?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const pad = dense ? 'px-4 py-2' : 'px-4 py-3';
  return (
    <div
      className={cn(
        'overflow-x-auto bg-surface',
        !bare && 'rounded-xl border border-line shadow-card',
      )}
    >
      <table className="min-w-full divide-y divide-line text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-surface-2 text-left text-[11px] font-semibold tracking-wider text-muted uppercase">
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={cn(pad, 'font-semibold', c.headerClassName)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-surface-2/70">
              {columns.map((c) => (
                <td key={c.header} className={c.className ?? pad}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
