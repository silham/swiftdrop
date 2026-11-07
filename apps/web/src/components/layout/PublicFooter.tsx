import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

const COLUMNS = [
  {
    title: 'Ship',
    links: [
      { href: '/register', label: 'Send a parcel' },
      { href: '/track', label: 'Track a parcel' },
      { href: '/#how-it-works', label: 'How it works' },
    ],
  },
  {
    title: 'Business',
    links: [
      { href: '/merchant-signup', label: 'Become a merchant' },
      { href: '/#merchants', label: 'Partner API' },
      { href: '/api/docs', label: 'API reference' },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/login', label: 'Sign in' },
      { href: '/register', label: 'Create account' },
    ],
  },
];

/** Public footer. Owner: M1 + M10. */
export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)] lg:px-8">
        <div className="max-w-xs">
          <Logo className="h-8" />
          <p className="mt-4 text-sm text-muted">
            Island-wide parcel delivery and courier management: book, dispatch, track and prove
            every delivery.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-semibold tracking-wider text-ink uppercase">{col.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted transition hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-subtle sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} SwiftDrop. University team project.</p>
          <p>Built with Next.js, NestJS, PostgreSQL and RabbitMQ.</p>
        </div>
      </div>
    </footer>
  );
}
