'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, FormField, Input } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';

export function MerchantSignupForm() {
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredMerchant, setRegisteredMerchant] = useState<{
    businessName: string;
    contactEmail: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/merchants/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          password,
          contactPhone: contactPhone.trim() || undefined,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw body;
      }

      setRegisteredMerchant({
        businessName: body.businessName,
        contactEmail: body.contactEmail,
      });
    } catch (err) {
      setError(errorMessage(err, 'Failed to complete registration'));
    } finally {
      setLoading(false);
    }
  }

  if (registeredMerchant) {
    return (
      <div className="space-y-4">
        <Alert tone="success">
          <p className="font-semibold">Application Submitted Successfully!</p>
          <p className="mt-1">
            Your merchant account for <strong>{registeredMerchant.businessName}</strong> has been
            created and is currently <strong>PENDING</strong> administrator review.
          </p>
        </Alert>

        <p className="text-sm text-muted">
          Once an administrator approves your account, you will be able to log in, generate API
          keys, and configure webhook delivery.
        </p>

        <div className="pt-2">
          <Link href="/login" className="inline-block w-full">
            <Button variant="primary" className="w-full">
              Proceed to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <FormField label="Business Name" htmlFor="businessName">
        <Input
          id="businessName"
          type="text"
          required
          placeholder="e.g. Lanka Bookshop & Stationers"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />
      </FormField>

      <FormField label="Contact Name" htmlFor="contactName">
        <Input
          id="contactName"
          type="text"
          required
          placeholder="e.g. Sunil Perera"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
      </FormField>

      <FormField label="Work Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          required
          placeholder="e.g. orders@lankabooks.lk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>

      <FormField label="Password" htmlFor="password" help="At least 8 characters">
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>

      <FormField label="Contact Phone (Optional)" htmlFor="contactPhone">
        <Input
          id="contactPhone"
          type="tel"
          placeholder="e.g. +94771234567"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
      </FormField>

      <Button type="submit" disabled={loading} className="w-full mt-2">
        {loading ? 'Submitting Application...' : 'Apply for Merchant Account'}
      </Button>

      <p className="text-center text-xs text-muted">
        Already registered?{' '}
        <Link href="/login" className="text-brand hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

