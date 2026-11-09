import { expect, test } from '@playwright/test';
import { apiAs, assignParcel, bookParcel, courierSetStatus } from '../support/api';

/**
 * Live tracking (M4): a visitor on the public tracking page sees a status change appear without
 * reloading. It travels outbox → relay → RabbitMQ → API SSE queue → browser, so this proves the
 * whole event path.
 */
test('the tracking page updates live when the courier changes the status', async ({
  page,
  playwright,
  baseURL,
}) => {
  const customer = await apiAs(playwright, baseURL, 'customer');
  const dispatcher = await apiAs(playwright, baseURL, 'dispatcher');
  const courier = await apiAs(playwright, baseURL, 'courier1');
  const parcel = await bookParcel(customer);
  await assignParcel(dispatcher, parcel.id);

  // Anonymous visitor, no saved session.
  await page.goto(`/track/${parcel.trackingNumber}`);
  await expect(page.getByText('Live Updates Active')).toBeVisible({ timeout: 15_000 });

  await courierSetStatus(courier, parcel.id, 'PICKED_UP');
  await expect(page.getByText('Picked up').first()).toBeVisible({ timeout: 30_000 });

  await courierSetStatus(courier, parcel.id, 'IN_TRANSIT');
  await expect(page.getByText('In transit').first()).toBeVisible({ timeout: 30_000 });

  await Promise.all([customer.dispose(), dispatcher.dispose(), courier.dispose()]);
});
