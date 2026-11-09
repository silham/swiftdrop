import { expect, test } from '@playwright/test';
import { PNG_1X1, apiAs, assignParcel, bookParcel, courierSetStatus } from '../support/api';
import { authFile } from '../support/auth';

/**
 * Courier on a phone (M6): a failed attempt, the same courier re-attempts, then delivers with a
 * photo. The parcel is set up through the API so this stays about the courier screens.
 * `@mobile` runs it in the Pixel 7 project as well.
 */
test.use({ storageState: authFile('courier1') });

test('courier reports a problem, re-attempts and delivers @mobile', async ({
  page,
  playwright,
  baseURL,
}) => {
  const customer = await apiAs(playwright, baseURL, 'customer');
  const dispatcher = await apiAs(playwright, baseURL, 'dispatcher');
  const parcel = await bookParcel(customer);
  await assignParcel(dispatcher, parcel.id);
  const courier = await apiAs(playwright, baseURL, 'courier1');
  await courierSetStatus(courier, parcel.id, 'PICKED_UP');
  await courierSetStatus(courier, parcel.id, 'IN_TRANSIT');
  await courierSetStatus(courier, parcel.id, 'OUT_FOR_DELIVERY');

  await page.goto('/courier');
  await page.getByRole('link', { name: new RegExp(parcel.trackingNumber) }).click();
  await expect(page.getByRole('link', { name: '+94777654321' })).toHaveAttribute(
    'href',
    'tel:+94777654321',
  );

  // Attempt 1 fails.
  await page.getByRole('button', { name: 'Report a problem' }).click();
  const fail = page.getByRole('dialog', { name: 'Report a problem' });
  await fail.getByLabel('Reason').selectOption('RECIPIENT_UNAVAILABLE');
  await fail.getByLabel('Note (optional)').fill('Nobody home');
  await fail.getByRole('button', { name: 'Mark as failed' }).click();
  await expect(fail).toBeHidden();
  await expect(page.getByText('Delivery failed').first()).toBeVisible();

  // The same courier re-attempts.
  await page.getByRole('button', { name: 'Re-attempt delivery' }).click();
  await expect(page.getByText('Out for delivery').first()).toBeVisible();

  // The photo is mandatory.
  await page.getByRole('button', { name: 'Mark delivered' }).click();
  const deliver = page.getByRole('dialog', { name: 'Mark delivered' });
  await deliver.getByRole('button', { name: 'Confirm delivery' }).click();
  await expect(deliver.getByText('Take or choose a photo')).toBeVisible();

  await deliver.getByLabel('Photo').setInputFiles({
    name: 'proof.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await deliver.getByRole('button', { name: 'Confirm delivery' }).click();
  await expect(page.getByText('This parcel has been delivered.')).toBeVisible();

  await Promise.all([customer.dispose(), dispatcher.dispose(), courier.dispose()]);
});

test("a courier cannot open another courier's parcel @mobile", async ({
  page,
  playwright,
  baseURL,
}) => {
  const customer = await apiAs(playwright, baseURL, 'customer');
  const parcel = await bookParcel(customer); // not assigned to anyone
  const res = await page.goto(`/courier/parcels/${parcel.id}`);
  expect(res?.status()).toBe(404);
  await customer.dispose();
});
