import { CircleX, PackageCheck, PackagePlus, PackageSearch, Truck, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { AssistantLauncher } from '@/features/assistant';
import { TrackForm } from '@/features/tracking';

export const metadata = { title: 'Track a parcel' };

const STATUSES = [
  { icon: PackagePlus, label: 'Created', text: 'The booking is confirmed and waiting for pickup.' },
  {
    icon: Warehouse,
    label: 'Picked up',
    text: 'A courier has collected the parcel from the sender.',
  },
  { icon: Truck, label: 'In transit', text: 'The parcel is moving between zones on the island.' },
  {
    icon: PackageSearch,
    label: 'Out for delivery',
    text: 'It is with the courier on today’s route.',
  },
  { icon: PackageCheck, label: 'Delivered', text: 'Handed over, with photo proof of delivery.' },
  {
    icon: CircleX,
    label: 'Delivery failed',
    text: 'The attempt failed; the reason is shown here.',
  },
];

const DEMO = ['SD100000001', 'SD100000002', 'SD100000003'];

/** Public tracking search. Owner: M4. Results live at /track/[trackingNumber]. */
export default function TrackSearchPage() {
  const showDemo = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true';
  return (
    <main>
      <section className="relative isolate overflow-hidden bg-sidebar pb-28 text-sidebar-ink">
        <div
          className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-96 w-[720px] -translate-x-1/2 rounded-full opacity-35 blur-3xl"
          style={{
            background: 'radial-gradient(closest-side, var(--sd-logo-orange), transparent)',
          }}
          aria-hidden="true"
        />
        <div className="mx-auto max-w-3xl px-4 pt-16 text-center sm:px-6">
          <p className="text-xs font-semibold tracking-wider text-logo-orange uppercase">
            Parcel tracking
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Track your parcel
          </h1>
          <p className="mt-4 text-sidebar-muted">
            Enter the tracking number from your booking confirmation or merchant email. Updates
            arrive live; no need to refresh.
          </p>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-20 max-w-3xl px-4 sm:px-6">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-xl sm:p-8">
          <TrackForm size="lg" />
          {showDemo && (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
              Demo numbers:
              {DEMO.map((tn) => (
                <Link
                  key={tn}
                  href={`/track/${tn}`}
                  className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-ink hover:border-brand/50"
                >
                  {tn}
                </Link>
              ))}
            </p>
          )}
        </div>
      </div>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-lg font-semibold text-ink">What each status means</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STATUSES.map(({ icon: Icon, label, text }) => (
            <li
              key={label}
              className="flex gap-3 rounded-xl border border-line bg-surface p-4 shadow-card"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{label}</p>
                <p className="mt-0.5 text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-center text-sm text-muted">
          Sending something?{' '}
          <Link href="/register" className="font-medium text-brand hover:text-brand-hover">
            Book a delivery
          </Link>{' '}
          in under a minute.
        </p>
      </section>
      <AssistantLauncher />
    </main>
  );
}
