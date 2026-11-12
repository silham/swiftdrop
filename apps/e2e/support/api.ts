import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { expect } from '@playwright/test';
import { ACCOUNTS, authFile, type Role } from './auth';

/** Recipient name on every parcel the suite books; cleanup (support/cleanup.ts) relies on it. */
export const E2E_RECIPIENT = 'E2E Recipient';

/** A 1×1 PNG: enough for the API's magic-byte check. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** An API client that is signed in as `role` (uses the session saved by global-setup.ts). */
export function apiAs(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
  role: Role,
) {
  return playwright.request.newContext({ baseURL, storageState: authFile(role) });
}

export interface BookedParcel {
  id: string;
  trackingNumber: string;
  recipientEmail: string;
}

/** Books a parcel as the demo customer through the API. The recipient email is unique per call. */
export async function bookParcel(customer: APIRequestContext): Promise<BookedParcel> {
  const recipientEmail = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const res = await customer.post('/api/v1/parcels', {
    data: {
      senderName: 'E2E Sender',
      senderPhone: '+94771234567',
      pickupAddress: '12 Galle Road',
      pickupCity: 'colombo',
      recipientName: E2E_RECIPIENT,
      recipientPhone: '+94777654321',
      recipientEmail,
      dropoffAddress: '5 Temple Street',
      dropoffCity: 'kandy',
      size: 'SMALL',
      weightKg: 1.5,
      description: 'E2E parcel',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  return { id: body.id, trackingNumber: body.trackingNumber, recipientEmail };
}

/** Dispatcher assigns a parcel to a demo courier. */
export async function assignParcel(
  dispatcher: APIRequestContext,
  parcelId: string,
  courier: Extract<Role, 'courier1'> = 'courier1',
) {
  const workload = await dispatcher.get('/api/v1/dispatch/couriers/workload');
  expect(workload.ok()).toBeTruthy();
  const couriers: { courierId: string; email: string }[] = await workload.json();
  const target = couriers.find((c) => c.email === ACCOUNTS[courier]);
  expect(target, `courier ${courier} not found in workload`).toBeTruthy();
  const res = await dispatcher.post('/api/v1/dispatch/assignments', {
    data: { parcelId, courierId: target!.courierId },
  });
  expect(res.status(), await res.text()).toBe(201);
}

/** Courier changes status through the API. */
export async function courierSetStatus(
  courier: APIRequestContext,
  parcelId: string,
  status: 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'FAILED',
  failureReason?: string,
) {
  const res = await courier.patch(`/api/v1/courier/parcels/${parcelId}/status`, {
    data: { status, failureReason },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Looks for a delivery email in Mailpit (dev mail catcher). */
export async function mailpitSubjects(query: string): Promise<string[]> {
  const base = process.env.MAILPIT_URL ?? 'http://localhost:8025';
  const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { messages?: { Subject: string }[] };
  return (body.messages ?? []).map((m) => m.Subject);
}
