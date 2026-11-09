import { expect, test } from '@playwright/test';
import { authFile } from '../support/auth';

/**
 * Customer journey (M3): get a price, book, see the parcel in My deliveries, open its details and
 * download the receipt. The fee is computed by the server (PricingService), never by the browser.
 */
test.use({ storageState: authFile('customer') });

test('a customer books a delivery and gets a receipt', async ({ page }) => {
  await page.goto('/customer/book');

  await page.getByLabel('Sender name').fill('E2E Customer');
  await page.getByLabel('Sender phone').fill('+94771234567');
  await page.getByLabel('Pickup address').fill('12 Galle Road');
  await page.getByLabel('Pickup city').fill('colombo');
  await page.getByLabel('Recipient name', { exact: true }).fill('E2E Recipient');
  await page.getByLabel('Recipient phone').fill('+94777654321');
  await page.getByLabel('Drop-off address').fill('5 Temple Street');
  await page.getByLabel('Drop-off city').fill('kandy');
  await page.getByLabel('Parcel size').selectOption('SMALL');
  await page.getByLabel('Weight (kg)').fill('1.5');

  // Confirming is only possible once the server has priced the parcel.
  await expect(page.getByRole('button', { name: 'Confirm booking' })).toBeDisabled();
  await page.getByRole('button', { name: 'Get price' }).click();
  await expect(page.getByRole('button', { name: 'Confirm booking' })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.getByText('Your delivery has been booked.')).toBeVisible();
  const trackingNumber = (await page.getByText(/^SD\d{9}$/).textContent())!.trim();

  await page.getByRole('link', { name: 'View delivery' }).click();
  await expect(page).toHaveURL(/\/customer\/parcels\/.+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(trackingNumber);
  await expect(page.getByText('Created').first()).toBeVisible();

  const receipt = await page.request.get(
    (await page.getByRole('link', { name: /Download receipt/ }).getAttribute('href')) as string,
  );
  expect(receipt.status()).toBe(200);
  expect(receipt.headers()['content-type']).toContain('application/pdf');

  // And it is listed in My deliveries.
  await page.goto('/customer');
  await expect(page.getByText(trackingNumber).first()).toBeVisible();
});

test('the booking form shows an error instead of submitting an empty form', async ({ page }) => {
  await page.goto('/customer/book');
  await page.getByRole('button', { name: 'Get price' }).click();
  await expect(page.getByText('Review the highlighted fields')).toBeVisible();
});
