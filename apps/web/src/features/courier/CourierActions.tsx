'use client';

import { FAILURE_REASONS, type FailureReason, type ParcelStatus } from '@swiftdrop/contracts';
import { Camera, CircleCheck, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, FormField, Input, Modal, Select, Textarea } from '@/components/ui';
import { silentRefresh } from '@/features/auth/silent-refresh';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { ActionBar } from './ActionBar';
import { planCourierActions, type CourierSettableStatus } from './actions';

const REASON_LABEL: Record<FailureReason, string> = {
  RECIPIENT_UNAVAILABLE: 'Recipient not available',
  ADDRESS_NOT_FOUND: 'Address not found',
  REFUSED: 'Recipient refused the parcel',
  DAMAGED: 'Parcel damaged',
  OTHER: 'Other',
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Upload with one silent refresh retry, since this goes through plain fetch (multipart). */
async function postProof(parcelId: string, form: FormData): Promise<Response> {
  const url = `/api/v1/courier/parcels/${encodeURIComponent(parcelId)}/proof`;
  const send = () => fetch(url, { method: 'POST', body: form, credentials: 'include' });
  const res = await send();
  if (res.status === 401 && (await silentRefresh())) return send();
  return res;
}

/**
 * Status buttons, the "Report a problem" dialog and the "Mark delivered" proof form for one
 * delivery. The API says what is allowed next; this only renders it. Owner: M6.
 */
export function CourierActions({
  parcelId,
  status,
  nextStatuses,
  canDeliver,
  recipientName,
}: {
  parcelId: string;
  status: ParcelStatus;
  nextStatuses: CourierSettableStatus[];
  canDeliver: boolean;
  recipientName: string;
}) {
  const router = useRouter();
  const plan = planCourierActions(status, nextStatuses, canDeliver);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'fail' | 'deliver' | null>(null);

  // Failed form
  const [reason, setReason] = useState<FailureReason>('RECIPIENT_UNAVAILABLE');
  const [note, setNote] = useState('');

  // Deliver form
  const [name, setName] = useState(recipientName);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>();

  function close() {
    if (busy) return;
    setDialog(null);
    setError(null);
  }

  async function changeStatus(
    to: CourierSettableStatus,
    extra?: { failureReason?: FailureReason; note?: string },
  ) {
    setBusy(true);
    setError(null);
    const { error: apiError } = await api.PATCH('/api/v1/courier/parcels/{id}/status', {
      params: { path: { id: parcelId } },
      body: { status: to, ...extra },
    });
    setBusy(false);
    if (apiError) {
      setError(errorMessage(apiError, 'Could not update the delivery'));
      return;
    }
    setDialog(null);
    router.refresh();
  }

  async function submitFailure(e: React.FormEvent) {
    e.preventDefault();
    await changeStatus('FAILED', { failureReason: reason, note: note.trim() || undefined });
  }

  async function submitDelivery(e: React.FormEvent) {
    e.preventDefault();
    if (!photo) {
      setPhotoError('Take or choose a photo of the delivered parcel');
      return;
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      setPhotoError('That photo is over 5 MB. Try a smaller one.');
      return;
    }
    setPhotoError(undefined);
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set('recipientName', name.trim());
    if (notes.trim()) form.set('notes', notes.trim());
    form.set('photo', photo);
    try {
      const res = await postProof(parcelId, form);
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => undefined);
        setError(errorMessage(body, 'Could not save the proof of delivery'));
        return;
      }
      setDialog(null);
      router.refresh();
    } catch {
      setError('Network problem. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!plan.primary && !plan.canFail) {
    return (
      <p className="text-sm text-muted">
        {status === 'DELIVERED'
          ? 'This parcel has been delivered.'
          : 'No further actions are available for this delivery.'}
      </p>
    );
  }

  return (
    <>
      {error && !dialog && <Alert tone="error">{error}</Alert>}

      <ActionBar
        secondary={
          plan.canFail ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => setDialog('fail')}
              disabled={busy}
            >
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              Report a problem
            </Button>
          ) : undefined
        }
        primary={
          plan.primary?.kind === 'deliver' ? (
            <Button type="button" size="lg" onClick={() => setDialog('deliver')} disabled={busy}>
              <CircleCheck className="h-4 w-4" aria-hidden="true" />
              Mark delivered
            </Button>
          ) : plan.primary ? (
            <Button
              type="button"
              size="lg"
              onClick={() => plan.primary?.kind === 'status' && void changeStatus(plan.primary.to)}
              disabled={busy}
            >
              {busy ? 'Saving…' : plan.primary.label}
            </Button>
          ) : (
            <span />
          )
        }
      />

      <Modal
        open={dialog === 'fail'}
        onClose={close}
        title="Report a problem"
        description="Tell dispatch why this delivery could not be completed."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="courier-fail-form" disabled={busy}>
              {busy ? 'Saving…' : 'Mark as failed'}
            </Button>
          </>
        }
      >
        <form id="courier-fail-form" onSubmit={submitFailure} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <FormField label="Reason" htmlFor="failure-reason">
            <Select
              id="failure-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as FailureReason)}
            >
              {FAILURE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Note (optional)" htmlFor="failure-note">
            <Textarea
              id="failure-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
        </form>
      </Modal>

      <Modal
        open={dialog === 'deliver'}
        onClose={close}
        title="Mark delivered"
        description="Record who received the parcel and take a photo as proof."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="courier-deliver-form" disabled={busy}>
              {busy ? 'Uploading…' : 'Confirm delivery'}
            </Button>
          </>
        }
      >
        <form id="courier-deliver-form" onSubmit={submitDelivery} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <FormField label="Received by" htmlFor="recipient-name">
            <Input
              id="recipient-name"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField
            label="Photo"
            htmlFor="proof-photo"
            error={photoError}
            help="JPEG, PNG or WebP, up to 5 MB."
          >
            <Input
              id="proof-photo"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                setPhoto(e.target.files?.[0] ?? null);
                setPhotoError(undefined);
              }}
            />
          </FormField>
          {photo && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Camera className="h-4 w-4" aria-hidden="true" />
              {photo.name} · {(photo.size / 1024).toFixed(0)} KB
            </p>
          )}
          <FormField label="Notes (optional)" htmlFor="proof-notes">
            <Textarea
              id="proof-notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </form>
      </Modal>
    </>
  );
}
