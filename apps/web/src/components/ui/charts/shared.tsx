'use client';

/** Shared bits for Recharts wrappers: series type, themed tooltip, a11y data table. */
export interface Series {
  key: string;
  label: string;
  /** CSS colour, defaults to the chart palette in order. */
  color?: string;
}

export const PALETTE = [
  'var(--sd-chart-1)',
  'var(--sd-chart-2)',
  'var(--sd-chart-3)',
  'var(--sd-chart-4)',
  'var(--sd-chart-5)',
  'var(--sd-chart-6)',
];

export const colorFor = (s: Series, i: number) => s.color ?? PALETTE[i % PALETTE.length];

export const axisProps = {
  tick: { fill: 'var(--sd-muted)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: 'var(--sd-line)',
  strokeDasharray: '3 3',
  vertical: false,
} as const;

interface TooltipEntry {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter = (v) => String(v),
  labelFormatter = (l) => String(l),
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatter?: (v: number) => string;
  labelFormatter?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {label != null && <p className="mb-1.5 font-medium text-ink">{labelFormatter(label)}</p>}
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: p.color }}
                aria-hidden="true"
              />
              {p.name}
            </span>
            <span className="font-medium text-ink tabular-nums">{formatter(Number(p.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartLegend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: colorFor(s, i) }}
            aria-hidden="true"
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Screen-reader copy of the chart data. */
export function ChartDataTable<T extends Record<string, unknown>>({
  data,
  xKey,
  xLabel,
  series,
  caption,
}: {
  data: T[];
  xKey: keyof T & string;
  xLabel: string;
  series: Series[];
  caption: string;
}) {
  return (
    <table className="sr-only-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{xLabel}</th>
          {series.map((s) => (
            <th key={s.key} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i}>
            <th scope="row">{String(row[xKey])}</th>
            {series.map((s) => (
              <td key={s.key}>{String(row[s.key] ?? '')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
