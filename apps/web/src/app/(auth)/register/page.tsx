import Link from 'next/link';
import { RegisterForm } from '@/features/auth';

export const metadata = { title: 'Create account' };

/** Owner: M2 — customer registration form (POST /api/v1/auth/register). */
export default function RegisterPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Create your account</h1>
        <p className="mt-1.5 text-sm text-muted">
          Book deliveries, get instant estimates and track every parcel.
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <RegisterForm />
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        Shipping for a business?{' '}
        <Link href="/merchant-signup" className="font-medium text-brand hover:text-brand-hover">
          Apply as a merchant
        </Link>
      </p>
    </>
  );
}
