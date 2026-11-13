import { expect, test } from '@playwright/test';
import { authFile } from '../support/auth';

/**
 * Merchant journey (M5): generate an API key in the portal (shown once), create an order through
 * the partner API with it, then see the order in the portal and on public tracking.
 */
test.use({ storageState: authFile('merchant') });

test('a merchant creates an API key and uses it to submit an order', async ({
  page,
  playwright,
  baseURL,
}) => {
  await page.goto('/merchant/api-keys');
  await page.getByRole('button', { name: 'Generate Key' }).first().click();
  await page.getByLabel('Key Name / Description').fill(`e2e-${Date.now()}`);
  await page.getByRole('button', { name: 'Confirm' }).click();

  const apiKey = await page.getByLabel('New API Key Generated').inputValue();
  expect(apiKey).toMatch(/^sd_/);

  // No cookies here: only the key authenticates the partner API.
  const partner = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { 'X-Api-Key': apiKey },
  });
  const merchantReference = `E2E-${Date.now()}`;
  const order = {
    merchantReference,
    senderName: 'Lanka Books',
    senderPhone: '+94771234567',
    pickupAddress: '123 Galle Road',
    pickupCity: 'colombo',
    recipientName: 'E2E Buyer',
    recipientPhone: '+94777654321',
    dropoffAddress: '5 Temple Street',
    dropoffCity: 'kandy',
    size: 'SMALL',
    weightKg: 1.2,
  };

  const created = await partner.post('/api/v1/merchant/parcels', { data: order });
  expect(created.status(), await created.text()).toBe(201);
  const parcel = await created.json();
  expect(parcel.trackingNumber).toMatch(/^SD\d{9}$/);

  // Retrying the same order is idempotent: same parcel, 200.
  const retry = await partner.post('/api/v1/merchant/parcels', { data: order });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).trackingNumber).toBe(parcel.trackingNumber);

  // A wrong key is rejected.
  const stranger = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { 'X-Api-Key': 'sd_live_nope_nope' },
  });
  expect((await stranger.post('/api/v1/merchant/parcels', { data: order })).status()).toBe(401);

  // The portal and public tracking see it.
  await page.goto('/merchant/orders');
  await expect(page.getByText(parcel.trackingNumber).first()).toBeVisible();
  await page.goto(`/track/${parcel.trackingNumber}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(parcel.trackingNumber);

  await Promise.all([partner.dispose(), stranger.dispose()]);
});
