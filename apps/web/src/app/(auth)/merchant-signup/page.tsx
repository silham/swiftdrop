import { MerchantSignupForm } from '@/features/merchant/MerchantSignupForm';

export const metadata = { title: 'Merchant sign-up' };

/** Owner: M5 — merchant registration (POST /api/v1/merchants/register); account starts PENDING. */
export default function MerchantSignupPage() {
  return (
    <>
      <div className="mb-8">
        <p className="mb-2 text-xs font-semibold tracking-wider text-brand uppercase">
          Partner programme
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Become a SwiftDrop merchant
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Apply once. After an admin approves your business you get API keys and webhooks.
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <MerchantSignupForm />
      </div>
    </>
  );
}
