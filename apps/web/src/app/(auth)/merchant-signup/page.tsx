import Link from 'next/link';
import { Card } from '@/components/ui';
import { MerchantSignupForm } from '@/features/merchant/MerchantSignupForm';

export const metadata = { title: 'Merchant sign-up' };

/** Owner: M5 — merchant registration (POST /api/v1/merchants/register); account starts PENDING. */
export default function MerchantSignupPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Link href="/" className="text-lg font-bold text-brand">
        SwiftDrop
      </Link>
      <Card className="mt-6 space-y-4">
        <h1 className="text-xl font-semibold">Become a SwiftDrop merchant</h1>
        <MerchantSignupForm />
      </Card>
    </main>
  );
}
