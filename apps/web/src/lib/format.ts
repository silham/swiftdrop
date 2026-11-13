/** Display formatting shared by dashboards. Owner: M1 + M10. Times shown in Sri Lanka time. */
const TZ = 'Asia/Colombo';

export const formatNumber = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? '—' : new Intl.NumberFormat('en-LK').format(n);

export const formatCompact = (n: number | null | undefined) =>
  n == null || Number.isNaN(n)
    ? '—'
    : new Intl.NumberFormat('en-LK', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** `fraction` is 0–1. */
export const formatPercent = (fraction: number | null | undefined, digits = 1) =>
  fraction == null || Number.isNaN(fraction)
    ? '—'
    : `${(fraction * 100).toFixed(digits).replace(/\.0+$/, '')}%`;

export const formatMoney = (cents: number | null | undefined, currency = 'LKR') =>
  cents == null
    ? '—'
    : new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(cents / 100);

export const formatDate = (value: string | Date | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: TZ }).format(
        new Date(value),
      )
    : '—';

export const formatDateTime = (value: string | Date | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: TZ,
      }).format(new Date(value))
    : '—';

/** "3 min ago", "2 days ago". */
export function formatRelative(value: string | Date | null | undefined, now = Date.now()) {
  if (!value) return '—';
  const diff = (new Date(value).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.345, 'week'],
    [12, 'month'],
    [Infinity, 'year'],
  ];
  let amount = diff;
  for (const [size, unit] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return formatDate(value);
}
