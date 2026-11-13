'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '../cn';
import { ChartTooltip, PALETTE } from './shared';

export interface DonutSlice {
  name: string;
  value: number;
  color?: string;
}

/** Donut with a centre total and a legend with values and shares. */
export function DonutChart({
  data,
  label,
  centerLabel = 'Total',
  centerValue,
  size = 180,
  valueFormatter = (v) => v.toLocaleString(),
  className,
}: {
  data: DonutSlice[];
  label: string;
  centerLabel?: string;
  centerValue?: React.ReactNode;
  size?: number;
  valueFormatter?: (v: number) => string;
  className?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const slices =
    total > 0
      ? data.filter((d) => d.value > 0)
      : [{ name: 'None', value: 1, color: 'var(--sd-line)' }];
  return (
    <div className={cn('flex flex-col items-center gap-5 sm:flex-row sm:items-center', className)}>
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        role="img"
        aria-label={label}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={total > 0 && slices.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((d, i) => (
                <Cell key={d.name} fill={d.color ?? PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            {total > 0 && <Tooltip content={<ChartTooltip formatter={valueFormatter} />} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-ink tabular-nums">
            {centerValue ?? valueFormatter(total)}
          </span>
          <span className="text-xs text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-2 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-muted">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: d.color ?? PALETTE[i % PALETTE.length] }}
                aria-hidden="true"
              />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="flex items-baseline gap-2 tabular-nums">
              <span className="font-medium text-ink">{valueFormatter(d.value)}</span>
              <span className="w-10 text-right text-xs text-subtle">
                {total > 0 ? `${Math.round((d.value / total) * 100)}%` : '—'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
