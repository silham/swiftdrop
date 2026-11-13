'use client';

import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  axisProps,
  ChartDataTable,
  ChartTooltip,
  colorFor,
  gridProps,
  type Series,
} from './shared';

/** Multi-series area/line trend over time (or any ordered x). */
export function AreaTrend<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 260,
  label,
  xLabel = 'Date',
  xFormatter = (v) => String(v),
  valueFormatter = (v) => v.toLocaleString(),
  stacked = false,
}: {
  data: T[];
  xKey: keyof T & string;
  series: Series[];
  height?: number;
  /** Accessible description of the chart. */
  label: string;
  xLabel?: string;
  xFormatter?: (v: string) => string;
  valueFormatter?: (v: number) => string;
  stacked?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <div role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={colorFor(s, i)} stopOpacity={0.28} />
                <stop offset="95%" stopColor={colorFor(s, i)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey={xKey as string}
            {...axisProps}
            tickFormatter={xFormatter}
            minTickGap={24}
          />
          <YAxis
            {...axisProps}
            allowDecimals={false}
            width={44}
            tickFormatter={(v: number) => valueFormatter(v)}
          />
          <Tooltip
            cursor={{ stroke: 'var(--sd-line-strong)' }}
            content={
              <ChartTooltip
                formatter={valueFormatter}
                labelFormatter={(l) => xFormatter(String(l))}
              />
            }
          />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? 'stack' : undefined}
              stroke={colorFor(s, i)}
              strokeWidth={2}
              fill={`url(#${id}-${s.key})`}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <ChartDataTable data={data} xKey={xKey} xLabel={xLabel} series={series} caption={label} />
    </div>
  );
}
