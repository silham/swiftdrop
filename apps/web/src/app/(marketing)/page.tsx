import Link from 'next/link';
import { TrackForm } from '@/features/tracking/TrackForm';

/** Public landing page. Owner: M3 (tracking form component: M4). */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-16 flex items-center justify-between">
        <span className="text-xl font-bold text-brand">SwiftDrop</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/merchant-signup" className="text-muted hover:text-ink">
            For merchants
          </Link>
          <Link href="/login" className="font-medium text-brand">
            Sign in
          </Link>
        </nav>
      </header>
      <section className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight">
          Island-wide parcel delivery, tracked live.
        </h1>
        <p className="mt-4 text-lg text-muted">
          Book a pickup, get an instant price, and follow your parcel from door to door.
        </p>
        <div className="mt-8">
          <TrackForm />
        </div>
        <div className="mt-6 flex gap-3">
          <Link
            href="/register"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            Send a parcel
          </Link>
        </div>
      </section>
    </main>
  );
}
