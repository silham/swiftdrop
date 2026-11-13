import { cn } from '../cn';

/** Tiny trend line for KPI tiles. Pure SVG (server-safe, no chart runtime). */
export function Sparkline({
  data,
  color = 'var(--sd-chart-1)',
  className,
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  if (data.length < 2) return null;
  const w = 100;
  const h = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 3 - ((v - min) / span) * (h - 6),
  ]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = `spark-${data.length}-${Math.round(max)}-${Math.round(min)}-${color.replace(/\W/g, '')}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn('overflow-visible', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
