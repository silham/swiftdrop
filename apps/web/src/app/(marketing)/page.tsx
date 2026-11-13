import {
  ArrowRight,
  BadgeCheck,
  Building,
  Camera,
  Check,
  ChartColumn,
  KeyRound,
  MapPin,
  PackagePlus,
  Radio,
  Route,
  ShieldCheck,
  Truck,
  Webhook,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui';

/** Public landing page. Owner: M3 (layout/brand: M1 + M10). Tracking lives at /track (M4). */
export default function HomePage() {
  return (
    <main>
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <Solutions />
      <MerchantApi />
      <CtaBand />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-sidebar text-sidebar-ink">
      {/* brand glow */}
      <div
        className="pointer-events-none absolute -top-40 right-[-10%] -z-10 h-[520px] w-[720px] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, var(--sd-logo-orange), transparent)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-[-30%] left-[-10%] -z-10 h-[420px] w-[620px] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, var(--sd-chart-2), transparent)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(var(--sd-sidebar-ink) 1px, transparent 1px), linear-gradient(90deg, var(--sd-sidebar-ink) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)',
        }}
        aria-hidden="true"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:px-8 lg:py-28">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-sidebar-line bg-sidebar-2 px-3 py-1 text-xs font-medium text-sidebar-ink/90">
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-logo-orange"
              aria-hidden="true"
            />
            Live tracking across all nine provinces
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Island-wide parcel delivery, <span className="text-logo-orange">tracked live.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-sidebar-muted">
            Book a pickup, get an instant price, and follow your parcel from door to door. One
            platform for customers, merchants, couriers and dispatch teams.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/register" className={buttonClasses({ size: 'lg' })}>
              Send a parcel <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/track"
              className="inline-flex items-center gap-2 rounded-lg border border-sidebar-line bg-sidebar-2 px-5 py-2.5 text-base font-medium text-sidebar-ink transition hover:border-sidebar-muted/50"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" /> Track a parcel
            </Link>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-sidebar-muted">
            {['Instant fee estimates', 'Photo proof of delivery', 'Email & SMS updates'].map(
              (t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-logo-orange" aria-hidden="true" /> {t}
                </li>
              ),
            )}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

/** Product mock built from the real design tokens (decorative). */
function HeroVisual() {
  const steps = ['Created', 'Picked up', 'In transit', 'Out for delivery', 'Delivered'];
  const current = 2;
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
      <div className="absolute -inset-4 rounded-3xl bg-logo-orange/10 blur-2xl" />
      <div className="relative rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Tracking number</p>
            <p className="font-mono text-sm font-semibold">SD100000002</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Live
          </span>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-xl bg-surface-2 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">From</p>
            <p className="font-medium">Colombo</p>
          </div>
          <div className="flex flex-1 items-center gap-1 text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            <span className="h-px flex-1 border-t border-dashed border-brand/60" />
            <Truck className="h-4 w-4" />
            <span className="h-px flex-1 border-t border-dashed border-line-strong" />
            <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">To</p>
            <p className="font-medium">Kandy</p>
          </div>
        </div>

        <ol className="mt-5 space-y-3">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span
                className={
                  i < current
                    ? 'flex h-6 w-6 items-center justify-center rounded-full bg-brand text-brand-fg'
                    : i === current
                      ? 'flex h-6 w-6 items-center justify-center rounded-full border-2 border-brand bg-brand-soft'
                      : 'flex h-6 w-6 items-center justify-center rounded-full border-2 border-line-strong'
                }
              >
                {i < current && <Check className="h-3.5 w-3.5" />}
                {i === current && <span className="h-2 w-2 rounded-full bg-brand" />}
              </span>
              <span className={i <= current ? 'font-medium' : 'text-muted'}>{s}</span>
              {i === current && <span className="ml-auto text-xs text-muted">Now</span>}
              {i < current && (
                <span className="ml-auto text-xs text-subtle">{i === 0 ? '09:12' : '10:47'}</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="absolute -bottom-16 -left-6 hidden w-56 rounded-xl border border-line bg-surface p-4 text-ink shadow-xl sm:block">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-soft text-success">
            <Camera className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Proof captured</p>
            <p className="text-xs text-muted">Photo + recipient name</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrustStrip() {
  const items = [
    { icon: MapPin, title: 'Island-wide zones', text: 'Zone-based pricing and dispatch' },
    { icon: Radio, title: 'Real-time tracking', text: 'Live status via server-sent events' },
    { icon: ShieldCheck, title: 'Secure by design', text: 'Role-based access on every request' },
    { icon: Webhook, title: 'Reliable webhooks', text: 'HMAC-signed with retries' },
  ];
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {items.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium text-ink">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold tracking-wider text-brand uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
      <p className="mt-4 text-muted">{text}</p>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: PackagePlus,
      title: 'Book in a minute',
      text: 'Enter pickup and drop-off details and see the delivery fee before you confirm.',
    },
    {
      icon: Route,
      title: 'We dispatch a courier',
      text: 'Dispatchers assign the right courier for the pickup zone and their current workload.',
    },
    {
      icon: Radio,
      title: 'Track it live',
      text: 'Every scan updates your tracking page instantly, with email and SMS notifications.',
    },
    {
      icon: BadgeCheck,
      title: 'Proof of delivery',
      text: 'Couriers capture a photo and recipient name, and you get a downloadable receipt.',
    },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="How it works"
          title="From doorstep to doorstep in four steps"
          text="A simple flow for senders, with full visibility for everyone involved."
        />
        <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li
              key={title}
              className="relative rounded-xl border border-line bg-surface p-6 shadow-card"
            >
              <span className="absolute top-6 right-6 font-mono text-xs text-subtle">0{i + 1}</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar text-logo-orange">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Solutions() {
  const cards = [
    {
      icon: PackagePlus,
      title: 'Customers',
      text: 'Book deliveries, get instant estimates, track parcels and download receipts.',
      points: ['Instant fee estimate', 'Delivery history', 'PDF receipts'],
      href: '/register',
      cta: 'Create an account',
    },
    {
      icon: Building,
      title: 'Merchants',
      text: 'Create parcels from your store through a secured partner API and receive webhooks.',
      points: ['API keys', 'Signed webhooks', 'Order dashboard'],
      href: '/merchant-signup',
      cta: 'Apply as a merchant',
    },
    {
      icon: Truck,
      title: 'Couriers',
      text: 'A mobile-first workflow to update status and capture proof of delivery.',
      points: ['Today’s run sheet', 'One-tap status updates', 'Photo proof'],
      href: '/login',
      cta: 'Courier sign in',
    },
    {
      icon: ChartColumn,
      title: 'Operations',
      text: 'Dispatch, zones, pricing rules, reports and a full audit trail for admins.',
      points: ['Workload-aware dispatch', 'Zone pricing', 'Audit log'],
      href: '/login',
      cta: 'Staff sign in',
    },
  ];
  return (
    <section id="solutions" className="scroll-mt-20 border-y border-line bg-surface py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Solutions"
          title="Built for everyone in the delivery chain"
          text="Each role gets its own secure portal with exactly the tools it needs."
        />
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ icon: Icon, title, text, points, href, cta }) => (
            <div
              key={title}
              className="flex flex-col rounded-xl border border-line bg-canvas p-6 transition hover:border-brand/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-muted">{text}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {points.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-ink">
                    <Check className="h-4 w-4 text-success" aria-hidden="true" /> {p}
                  </li>
                ))}
              </ul>
              <Link
                href={href}
                className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium text-brand hover:text-brand-hover"
              >
                {cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MerchantApi() {
  return (
    <section id="merchants" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="text-xs font-semibold tracking-wider text-brand uppercase">For merchants</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Plug deliveries straight into your store
          </h2>
          <p className="mt-4 text-muted">
            Create parcels with one API call, then let SwiftDrop push every status change back to
            you. Approved merchants get API keys, signed webhooks, retries and a dead-letter queue
            for anything that fails.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              { icon: KeyRound, t: 'Scoped API keys', d: 'Create and revoke keys any time' },
              { icon: Webhook, t: 'HMAC-signed webhooks', d: 'Verify every event you receive' },
              { icon: Zap, t: 'Automatic retries', d: 'Back-off retries, then a DLQ' },
              { icon: ShieldCheck, t: 'Tenant isolation', d: 'You only ever see your parcels' },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <div>
                  <p className="font-medium text-ink">{t}</p>
                  <p className="text-sm text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/merchant-signup" className={buttonClasses()}>
              Become a merchant
            </Link>
            <Link href="/api/docs" className={buttonClasses({ variant: 'secondary' })}>
              Read the API docs
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-sidebar-line bg-sidebar shadow-2xl">
          <div className="flex items-center gap-2 border-b border-sidebar-line px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-sidebar-muted/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-sidebar-muted/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-sidebar-muted/40" />
            <span className="ml-3 font-mono text-xs text-sidebar-muted">create-parcel.sh</span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-sidebar-ink">
            <code>
              <span className="text-sidebar-muted">$ </span>curl -X POST \{'\n'}
              {'  '}https://swiftdrop.lk
              <span className="text-logo-orange">/api/v1/merchant/parcels</span> \{'\n'}
              {'  '}-H <span className="text-success">&quot;X-Api-Key: sd_live_••••••&quot;</span> \
              {'\n'}
              {'  '}-d <span className="text-success">{"'{"}</span>
              {'\n'}
              {'    '}&quot;merchantReference&quot;: &quot;ORDER-10023&quot;,{'\n'}
              {'    '}&quot;pickupCity&quot;: &quot;colombo&quot;,{'\n'}
              {'    '}&quot;dropoffCity&quot;: &quot;kandy&quot;,{'\n'}
              {'    '}&quot;size&quot;: &quot;SMALL&quot;, &quot;weightKg&quot;: 1.5{'\n'}
              {'  '}
              <span className="text-success">{"}'"}</span>
              {'\n\n'}
              <span className="text-sidebar-muted"># webhook → your endpoint</span>
              {'\n'}
              <span className="text-logo-orange">parcel.created</span>
              {'           '}
              <span className="text-sidebar-muted">201</span>
              {'\n'}
              <span className="text-logo-orange">parcel.courier_assigned</span>
              {'  '}
              <span className="text-sidebar-muted">200</span>
              {'\n'}
              <span className="text-logo-orange">parcel.status_changed</span>
              {'    '}
              <span className="text-sidebar-muted">200</span>
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
      <div className="relative isolate mx-auto max-w-7xl overflow-hidden rounded-3xl bg-sidebar px-6 py-14 text-center text-sidebar-ink sm:px-12">
        <div
          className="pointer-events-none absolute inset-x-0 -bottom-24 -z-10 mx-auto h-64 w-2/3 rounded-full opacity-40 blur-3xl"
          style={{
            background: 'radial-gradient(closest-side, var(--sd-logo-orange), transparent)',
          }}
          aria-hidden="true"
        />
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Ready to send your first parcel?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sidebar-muted">
          Create a free account, get an instant estimate and book a pickup in under a minute.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/register" className={buttonClasses({ size: 'lg' })}>
            Get started
          </Link>
          <Link
            href="/track"
            className="inline-flex items-center gap-2 rounded-lg border border-sidebar-line bg-sidebar-2 px-5 py-2.5 text-base font-medium text-sidebar-ink transition hover:border-sidebar-muted/50"
          >
            Track a parcel
          </Link>
        </div>
      </div>
    </section>
  );
}
