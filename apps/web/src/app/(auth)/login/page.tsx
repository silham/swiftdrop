import Link from 'next/link';
import { Suspense } from 'react';
import { Card } from '@/components/ui';
import { DevLoginPanel } from '@/features/auth/DevLoginPanel';
import { LoginForm } from '@/features/auth/LoginForm';

export const metadata = { title: 'Sign in' };

/** Owner: M2 */
export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Link href="/" className="text-lg font-bold text-brand">
        SwiftDrop
      </Link>
      <Card className="mt-6 space-y-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="text-sm text-muted">
          New here?{' '}
          <Link href="/register" className="text-brand">
            Create an account
          </Link>
        </p>
      </Card>
      {process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true' && <DevLoginPanel />}
    </main>
  );
}
