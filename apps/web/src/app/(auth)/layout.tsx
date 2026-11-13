import { Camera, Radio, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

const POINTS = [
  { icon: Radio, title: 'Live tracking', text: 'Every status change reaches you instantly.' },
  { icon: Camera, title: 'Proof of delivery', text: 'Photo and recipient name on every drop-off.' },
  { icon: ShieldCheck, title: 'Secure portals', text: 'Role-based access for every team member.' },
];

/** Sign-in / sign-up pages: brand panel + form column. Owner: M1 + M10 (forms: M2, M5). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative isolate hidden overflow-hidden bg-sidebar p-12 text-sidebar-ink lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 -z-10 h-[520px] w-[620px] rounded-full opacity-40 blur-3xl"
          style={{
            background: 'radial-gradient(closest-side, var(--sd-logo-orange), transparent)',
          }}
          aria-hidden="true"
        />
        <Link href="/" aria-label="SwiftDrop home">
          <Logo className="h-9" onDark />
        </Link>
        <div className="my-auto max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">
            Deliveries, dispatch and tracking in one place.
          </h2>
          <p className="mt-4 text-sidebar-muted">
            SwiftDrop connects customers, merchants, couriers and operations teams across the
            island.
          </p>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-2 text-logo-orange">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-sidebar-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">© {new Date().getFullYear()} SwiftDrop</p>
      </aside>

      <div className="flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 sm:px-10">
          <Link href="/" aria-label="SwiftDrop home" className="lg:invisible">
            <Logo className="h-8" />
          </Link>
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:px-6">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
