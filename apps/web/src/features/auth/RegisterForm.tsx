'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, FormField, Input } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';

/** Owner: M2 — Customer registration form submitting to POST /api/v1/auth/register */
export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(form: FormData) {
    setPending(true);
    setError(undefined);

    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const phone = String(form.get('phone') ?? '').trim();

    if (password.length < 8) {
      setPending(false);
      return setError('Password must be at least 8 characters long');
    }

    const { data, error: apiErr } = await api.POST('/api/v1/auth/register', {
      body: {
        name,
        email,
        password,
        phone: phone || undefined,
      },
    });

    setPending(false);

    if (apiErr || !data) {
      return setError(errorMessage(apiErr, 'Registration failed'));
    }

    router.push(data.home ?? '/customer');
    router.refresh();
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <FormField label="Full name" htmlFor="name">
        <Input id="name" name="name" type="text" autoComplete="name" required placeholder="e.g. John Doe" />
      </FormField>

      <FormField label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </FormField>

      <FormField label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
        />
      </FormField>

      <FormField label="Phone (optional)" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+94770000000" />
      </FormField>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>

      <div className="relative my-4 text-center text-xs text-muted">
        <span className="bg-surface px-2">or continue with</span>
        <div className="absolute inset-0 -z-10 flex items-center">
          <div className="w-full border-t border-line" />
        </div>
      </div>

      <a
        href="/api/v1/auth/google"
        className="flex w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        Sign up with Google
      </a>

      <p className="pt-2 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
