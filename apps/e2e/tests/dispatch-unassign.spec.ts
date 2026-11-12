import { expect, test } from '@playwright/test';
import { apiAs, assignParcel, bookParcel, courierSetStatus } from '../support/api';
import { authFile } from '../support/auth';

/**
 * Dispatcher (M7): the "Active assignments" card shows who has which parcel and lets dispatch take
 * a parcel back while it is not yet on the road. Setup goes through the API; the checks are on the UI.
 */
test.use({ storageState: authFile('dispatcher') });

test('a dispatcher takes a parcel back from a courier', async ({ page, playwright, baseURL }) => {
  const customer = await apiAs(playwright, baseURL, 'customer');
  const dispatcher = await apiAs(playwright, baseURL, 'dispatcher');
  const parcel = await bookParcel(customer);
  await assignParcel(dispatcher, parcel.id);

  await page.goto('/dispatch');
  await expect(page.getByRole('heading', { name: 'Active assignments' })).toBeVisible();
  // Scoped to the assignments table: after unassigning, the parcel shows up again in the queue.
  const row = page
    .getByRole('table', { name: 'Active assignments' })
    .getByRole('row', { name: new RegExp(parcel.trackingNumber) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Chamal Courier');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: `Unassign ${parcel.trackingNumber}` }).click();
  await expect(row).toBeHidden();

  // The parcel is free again: assigning it a second time would be 409 ALREADY_ASSIGNED otherwise.
  await assignParcel(dispatcher, parcel.id);

  await Promise.all([customer.dispose(), dispatcher.dispose()]);
});

test('a parcel that is already on the road cannot be unassigned', async ({
  page,
  playwright,
  baseURL,
}) => {
  const customer = await apiAs(playwright, baseURL, 'customer');
  const dispatcher = await apiAs(playwright, baseURL, 'dispatcher');
  const courier = await apiAs(playwright, baseURL, 'courier1');
  const parcel = await bookParcel(customer);
  await assignParcel(dispatcher, parcel.id);
  await courierSetStatus(courier, parcel.id, 'PICKED_UP');
  await courierSetStatus(courier, parcel.id, 'IN_TRANSIT');

  await page.goto('/dispatch');
  await expect(
    page
      .getByRole('table', { name: 'Active assignments' })
      .getByRole('row', { name: new RegExp(parcel.trackingNumber) }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: `Unassign ${parcel.trackingNumber}` }),
  ).toBeDisabled();

  await Promise.all([customer.dispose(), dispatcher.dispose(), courier.dispose()]);
});
