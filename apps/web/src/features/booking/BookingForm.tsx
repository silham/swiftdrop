'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { PARCEL_SIZES } from '@swiftdrop/contracts';
import { Calculator, MapPin, Package, UserRound } from 'lucide-react';
import {
  Alert,
  Button,
  buttonClasses,
  Card,
  FormField,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import {
  bookingErrors,
  bookingPayload,
  ESTIMATE_FIELDS,
  estimateErrors,
  estimatePayload,
  INITIAL_VALUES,
  type FormErrors,
  type FormValues,
} from './booking-form.logic';
import { requestBookingCreation, requestBookingEstimate } from './booking.requests';

type Estimate = components['schemas']['EstimateResponseDto'];
type CreatedParcel = components['schemas']['ParcelDto'];

function formatFee(estimate: Estimate) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: estimate.currency,
    minimumFractionDigits: 2,
  }).format(estimate.feeCents / 100);
}

function focusFirstError(errors: FormErrors) {
  const firstField = Object.keys(errors)[0];
  if (firstField) requestAnimationFrame(() => document.getElementById(firstField)?.focus());
}

export function BookingForm() {
  const router = useRouter();
  const estimateRevision = useRef(0);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateError, setEstimateError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedParcel | null>(null);

  function setField<Key extends keyof FormValues>(field: Key, value: FormValues[Key]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError(undefined);
    if (ESTIMATE_FIELDS.has(field)) {
      estimateRevision.current += 1;
      setEstimate(null);
      setEstimateError(undefined);
    }
  }

  async function getEstimate() {
    const nextErrors = estimateErrors(values);
    setErrors(nextErrors);
    setSubmitError(undefined);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }

    const revision = estimateRevision.current;
    setEstimating(true);
    setEstimateError(undefined);
    try {
      const result = await requestBookingEstimate(estimatePayload(values), (body) =>
        api.POST('/api/v1/pricing/estimate', { body }),
      );
      if (estimateRevision.current !== revision) return;
      if (result.ok) {
        setEstimate(result.data);
      } else {
        setEstimateError(result.message);
      }
    } finally {
      setEstimating(false);
    }
  }

  async function confirmBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = bookingErrors(values);
    setErrors(nextErrors);
    setSubmitError(undefined);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }
    if (!estimate) {
      setSubmitError('Get an up-to-date price before confirming this booking.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestBookingCreation(bookingPayload(values), (body) =>
        api.POST('/api/v1/parcels', { body }),
      );
      if (result.ok) {
        setCreated(result.data);
        router.refresh();
      } else {
        setSubmitError(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <Card flush className="max-w-2xl" aria-live="polite">
        <div className="p-6">
          <Alert tone="success">Your delivery has been booked.</Alert>
          <h2 className="mt-6 text-sm font-medium tracking-wide text-muted uppercase">
            Tracking number
          </h2>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-wide break-all text-ink">
            {created.trackingNumber}
          </p>
          <p className="mt-2 text-sm text-muted">
            Keep this number to follow the delivery from pickup to completion.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href={`/customer/parcels/${created.id}`} className={buttonClasses()}>
              View delivery
            </Link>
            <Link href="/customer" className={buttonClasses({ variant: 'secondary' })}>
              My deliveries
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <form
      onSubmit={confirmBooking}
      noValidate
      className="space-y-6"
      aria-busy={estimating || submitting}
    >
      {(estimateError || submitError) && (
        <div aria-live="assertive">
          <Alert tone="error">{submitError ?? estimateError}</Alert>
        </div>
      )}

      {Object.values(errors).some(Boolean) && (
        <Alert tone="error">
          <div aria-labelledby="booking-errors-title">
            <p id="booking-errors-title" className="font-medium">
              Review the highlighted fields
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {Object.entries(errors).map(([field, message]) =>
                message ? (
                  <li key={field}>
                    <a href={`#${field}`} className="underline">
                      {message}
                    </a>
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <FormSection
            step={1}
            id="sender-heading"
            title="Sender and pickup"
            description="Who is sending the parcel and where to collect it."
            icon={<MapPin />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Sender name" htmlFor="senderName" error={errors.senderName}>
                <Input
                  id="senderName"
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={values.senderName}
                  aria-invalid={Boolean(errors.senderName)}
                  onChange={(event) => setField('senderName', event.target.value)}
                />
              </FormField>
              <FormField label="Sender phone" htmlFor="senderPhone" error={errors.senderPhone}>
                <Input
                  id="senderPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder="+94771234567"
                  value={values.senderPhone}
                  aria-invalid={Boolean(errors.senderPhone)}
                  onChange={(event) => setField('senderPhone', event.target.value)}
                />
              </FormField>
              <FormField
                label="Pickup address"
                htmlFor="pickupAddress"
                error={errors.pickupAddress}
              >
                <Input
                  id="pickupAddress"
                  autoComplete="street-address"
                  required
                  maxLength={200}
                  value={values.pickupAddress}
                  aria-invalid={Boolean(errors.pickupAddress)}
                  onChange={(event) => setField('pickupAddress', event.target.value)}
                />
              </FormField>
              <FormField label="Pickup city" htmlFor="pickupCity" error={errors.pickupCity}>
                <Input
                  id="pickupCity"
                  autoComplete="address-level2"
                  required
                  maxLength={80}
                  value={values.pickupCity}
                  aria-invalid={Boolean(errors.pickupCity)}
                  onChange={(event) => setField('pickupCity', event.target.value)}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            step={2}
            id="recipient-heading"
            title="Recipient and drop-off"
            description="Who will receive the parcel and where to deliver it."
            icon={<UserRound />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Recipient name"
                htmlFor="recipientName"
                error={errors.recipientName}
              >
                <Input
                  id="recipientName"
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={values.recipientName}
                  aria-invalid={Boolean(errors.recipientName)}
                  onChange={(event) => setField('recipientName', event.target.value)}
                />
              </FormField>
              <FormField
                label="Recipient phone"
                htmlFor="recipientPhone"
                error={errors.recipientPhone}
              >
                <Input
                  id="recipientPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder="+94771234567"
                  value={values.recipientPhone}
                  aria-invalid={Boolean(errors.recipientPhone)}
                  onChange={(event) => setField('recipientPhone', event.target.value)}
                />
              </FormField>
              <FormField
                label="Recipient email (optional)"
                htmlFor="recipientEmail"
                error={errors.recipientEmail}
              >
                <Input
                  id="recipientEmail"
                  type="email"
                  autoComplete="email"
                  value={values.recipientEmail}
                  aria-invalid={Boolean(errors.recipientEmail)}
                  onChange={(event) => setField('recipientEmail', event.target.value)}
                />
              </FormField>
              <div className="hidden sm:block" aria-hidden="true" />
              <FormField
                label="Drop-off address"
                htmlFor="dropoffAddress"
                error={errors.dropoffAddress}
              >
                <Input
                  id="dropoffAddress"
                  autoComplete="street-address"
                  required
                  maxLength={200}
                  value={values.dropoffAddress}
                  aria-invalid={Boolean(errors.dropoffAddress)}
                  onChange={(event) => setField('dropoffAddress', event.target.value)}
                />
              </FormField>
              <FormField label="Drop-off city" htmlFor="dropoffCity" error={errors.dropoffCity}>
                <Input
                  id="dropoffCity"
                  autoComplete="address-level2"
                  required
                  maxLength={80}
                  value={values.dropoffCity}
                  aria-invalid={Boolean(errors.dropoffCity)}
                  onChange={(event) => setField('dropoffCity', event.target.value)}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            step={3}
            id="parcel-heading"
            title="Parcel details"
            description="Size and weight determine the delivery price."
            icon={<Package />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Parcel size" htmlFor="size" error={errors.size}>
                <Select
                  id="size"
                  required
                  value={values.size}
                  aria-invalid={Boolean(errors.size)}
                  onChange={(event) => setField('size', event.target.value as FormValues['size'])}
                >
                  <option value="">Select a size</option>
                  {PARCEL_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size.charAt(0) + size.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="Weight (kg)"
                htmlFor="weightKg"
                error={errors.weightKg}
                help="Maximum 100 kg"
              >
                <Input
                  id="weightKg"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="100"
                  step="0.01"
                  required
                  value={values.weightKg}
                  aria-invalid={Boolean(errors.weightKg)}
                  onChange={(event) => setField('weightKg', event.target.value)}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField
                  label="Description (optional)"
                  htmlFor="description"
                  error={errors.description}
                  help={`${values.description.length}/500 characters`}
                >
                  <Textarea
                    id="description"
                    rows={3}
                    maxLength={500}
                    value={values.description}
                    aria-invalid={Boolean(errors.description)}
                    onChange={(event) => setField('description', event.target.value)}
                  />
                </FormField>
              </div>
            </div>
          </FormSection>
        </div>

        <aside className="lg:sticky lg:top-24" aria-label="Booking summary">
          <Card flush>
            <div className="border-b border-line px-5 py-4" aria-live="polite">
              <h2 className="text-sm font-semibold text-ink">Delivery price</h2>
              {estimate ? (
                <>
                  <p className="mt-2 text-3xl font-semibold text-ink tabular-nums">
                    {formatFee(estimate)}
                  </p>
                  <p className="mt-1 text-xs text-muted">Based on {estimate.ruleName}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Enter both cities, size and weight to request a price.
                </p>
              )}
            </div>
            <dl className="space-y-3 px-5 py-4 text-sm">
              <SummaryRow label="From" value={values.pickupCity} />
              <SummaryRow label="To" value={values.dropoffCity} />
              <SummaryRow
                label="Size"
                value={
                  values.size ? values.size.charAt(0) + values.size.slice(1).toLowerCase() : ''
                }
              />
              <SummaryRow label="Weight" value={values.weightKg ? `${values.weightKg} kg` : ''} />
            </dl>
            <div className="space-y-3 border-t border-line bg-surface-2/60 px-5 py-4">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={estimating || submitting}
                aria-busy={estimating}
                onClick={getEstimate}
              >
                <Calculator className="h-4 w-4" aria-hidden="true" />
                {estimating ? 'Getting price...' : estimate ? 'Refresh price' : 'Get price'}
              </Button>
              <Button
                type="submit"
                className="w-full"
                disabled={!estimate || submitting || estimating}
                aria-busy={submitting}
              >
                {submitting ? 'Confirming...' : 'Confirm booking'}
              </Button>
              <Link
                href="/customer"
                className="block py-1 text-center text-sm font-medium text-muted hover:text-ink"
              >
                Cancel
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </form>
  );
}

function FormSection({
  step,
  id,
  title,
  description,
  icon,
  children,
}: {
  step: number;
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
          aria-hidden="true"
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        </div>
        <span className="hidden text-subtle sm:block [&_svg]:h-5 [&_svg]:w-5" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-medium text-ink capitalize">{value.trim() || '—'}</dd>
    </div>
  );
}
