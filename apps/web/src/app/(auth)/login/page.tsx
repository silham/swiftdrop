import Link from 'next/link';
import { Suspense } from 'react';
import { DevLoginPanel } from '@/features/auth/DevLoginPanel';
import { LoginForm } from '@/features/auth/LoginForm';

export const metadata = { title: 'Sign in' };

/** Owner: M2 */
export default function LoginPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-1.5 text-sm text-muted">Welcome back. Sign in to your SwiftDrop portal.</p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <Link href="/register" className="font-medium text-brand hover:text-brand-hover">
          Create an account
        </Link>{' '}
        ·{' '}
        <Link href="/merchant-signup" className="font-medium text-brand hover:text-brand-hover">
          Become a merchant
        </Link>
      </p>
      {process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true' && <DevLoginPanel />}
    </>
  );
}
