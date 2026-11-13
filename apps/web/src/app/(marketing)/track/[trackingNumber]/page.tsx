import type { ParcelStatus } from '@swiftdrop/contracts';
import { CircleQuestionMark, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Alert, EmptyState, PageHeader } from '@/components/ui';
import { AssistantLauncher } from '@/features/assistant';
import { TrackForm, TrackingView } from '@/features/tracking';
import { errorCode, errorMessage } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';

/** Public tracking result. Owner: M4. */
export default async function TrackPage({
  params,
}: {
  params: Promise<{ trackingNumber: string }>;
}) {
  const { trackingNumber } = await params;
  const api = await serverApi();

  const { data: parcel, error } = await api.GET('/api/v1/tracking/{trackingNumber}', {
    params: { path: { trackingNumber } },
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Track', href: '/track' },
          { label: trackingNumber },
        ]}
        title={`Tracking ${trackingNumber}`}
        description="Live parcel delivery status and milestone tracking"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {error || !parcel ? (
            errorCode(error) === 'NOT_FOUND' ? (
              <EmptyState
                title="Parcel Not Found"
                description={`We couldn't locate any parcel with tracking number "${trackingNumber}". Please verify the number and try again.`}
              />
            ) : (
              <Alert tone="error">
                {errorMessage(error, 'Tracking is unavailable right now. Please try again.')}
              </Alert>
            )
          ) : (
            <TrackingView
              trackingNumber={parcel.trackingNumber}
              initialStatus={parcel.status as ParcelStatus}
              initialHistory={parcel.history.map((h) => ({
                status: h.status as ParcelStatus,
                at: new Date(h.at).toISOString(),
                reason: (h.reason as string | null) ?? null,
              }))}
              initialUpdatedAt={new Date(parcel.updatedAt).toISOString()}
              originCity={parcel.originCity}
              destinationCity={parcel.destinationCity}
            />
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-ink">Track Another Parcel</h3>
            <TrackForm />
          </div>
          <div className="rounded-xl border border-line bg-surface p-5 text-sm shadow-card">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <p className="text-muted">
                Public tracking shows cities and status only. Names, phone numbers and addresses
                stay private.
              </p>
            </div>
            <div className="mt-4 flex gap-3">
              <CircleQuestionMark
                className="mt-0.5 h-4 w-4 shrink-0 text-info"
                aria-hidden="true"
              />
              <p className="text-muted">
                Sent this parcel?{' '}
                <Link href="/login" className="font-medium text-brand hover:text-brand-hover">
                  Sign in
                </Link>{' '}
                to see full details, proof of delivery and your receipt.
              </p>
            </div>
          </div>
        </aside>
      </div>
      <AssistantLauncher trackingNumber={parcel ? trackingNumber : undefined} />
    </main>
  );
}
