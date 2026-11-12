import type { APIRequestContext } from '@playwright/test';
import { E2E_RECIPIENT, PNG_1X1 } from './api';

interface CourierParcel {
  id: string;
  recipientName: string;
  nextStatuses: string[];
  canDeliver: boolean;
}

/**
 * Finishes parcels that earlier e2e runs left with the demo courier (a run that stops half-way, or a
 * spec that ends mid-journey). Otherwise they pile up and the courier hits their capacity limit,
 * after which every assigning spec fails. Uses the normal courier API and only touches parcels the
 * suite itself created (recipient "E2E Recipient"); demo seed data is left alone.
 */
export async function finishLeftoverE2eParcels(courier: APIRequestContext): Promise<number> {
  const res = await courier.get('/api/v1/courier/parcels');
  if (!res.ok()) return 0;
  const parcels = ((await res.json()) as CourierParcel[]).filter(
    (p) => p.recipientName === E2E_RECIPIENT,
  );

  let finished = 0;
  for (const parcel of parcels) {
    let current = parcel;
    // Walk the allowed steps (never FAILED) until delivery is possible; at most four steps.
    for (let step = 0; step < 6 && !current.canDeliver; step++) {
      const next = current.nextStatuses.find((s) => s !== 'FAILED');
      if (!next) break;
      const moved = await courier.patch(`/api/v1/courier/parcels/${parcel.id}/status`, {
        data: { status: next },
      });
      if (!moved.ok()) break;
      current = await moved.json();
    }
    if (!current.canDeliver) continue;
    const delivered = await courier.post(`/api/v1/courier/parcels/${parcel.id}/proof`, {
      multipart: {
        recipientName: 'E2E cleanup',
        photo: { name: 'proof.png', mimeType: 'image/png', buffer: PNG_1X1 },
      },
    });
    if (delivered.ok()) finished++;
  }
  return finished;
}
