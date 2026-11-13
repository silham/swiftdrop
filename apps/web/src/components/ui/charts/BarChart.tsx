'use client';

import {
  Bar,
  BarChart as RBarChart,
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

/** Vertical (or horizontal with `layout="horizontal-bars"`) grouped or stacked bars. */
export function BarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 260,
  label,
  xLabel = 'Category',
  stacked = false,
  layout = 'columns',
  xFormatter = (v) => String(v),
  valueFormatter = (v) => v.toLocaleString(),
  maxValue,
  categoryWidth = 150,
}: {
  data: T[];
  xKey: keyof T & string;
  series: Series[];
  height?: number;
  label: string;
  xLabel?: string;
  stacked?: boolean;
  layout?: 'columns' | 'horizontal-bars';
  xFormatter?: (v: string) => string;
  valueFormatter?: (v: number) => string;
  maxValue?: number;
  /** Width of the category axis for horizontal bars (labels never wrap). */
  categoryWidth?: number;
}) {
  const horizontal = layout === 'horizontal-bars';
  const domain: [number, number | 'auto'] = [0, maxValue ?? 'auto'];
  return (
    <div role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart
          data={data}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 8, left: horizontal ? 8 : -12, bottom: 0 }}
          barCategoryGap={horizontal ? 6 : '22%'}
        >
          <CartesianGrid {...gridProps} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                {...axisProps}
                domain={domain}
                allowDecimals={false}
                tickFormatter={(v: number) => valueFormatter(v)}
              />
              <YAxis
                type="category"
                dataKey={xKey as string}
                {...axisProps}
                width={categoryWidth}
                interval={0}
                tickFormatter={xFormatter}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey as string}
                {...axisProps}
                tickFormatter={xFormatter}
                minTickGap={16}
              />
              <YAxis
                {...axisProps}
                domain={domain}
                allowDecimals={false}
                width={44}
                tickFormatter={(v: number) => valueFormatter(v)}
              />
            </>
          )}
          <Tooltip
            cursor={{ fill: 'var(--sd-surface-2)' }}
            content={
              <ChartTooltip
                formatter={valueFormatter}
                labelFormatter={(l) => xFormatter(String(l))}
              />
            }
          />
          {series.map((s, i) => {
            const last = i === series.length - 1;
            const radius: [number, number, number, number] = horizontal
              ? [0, 4, 4, 0]
              : [4, 4, 0, 0];
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={colorFor(s, i)}
                stackId={stacked ? 'stack' : undefined}
                radius={!stacked || last ? radius : 0}
                maxBarSize={horizontal ? 18 : 28}
              />
            );
          })}
        </RBarChart>
      </ResponsiveContainer>
      <ChartDataTable data={data} xKey={xKey} xLabel={xLabel} series={series} caption={label} />
    </div>
  );
}
