import { expect, test } from '@playwright/test';

/** Smoke: the stack is up, routing works, dev login + role redirects work. */
test('landing page loads and links to tracking', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('parcel delivery');
  await page.getByRole('link', { name: 'Track a parcel' }).first().click();
  await expect(page).toHaveURL(/\/track$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Track your parcel');
});

test('tracking search navigates to the result page', async ({ page }) => {
  await page.goto('/track');
  await page.getByLabel('Tracking number').fill('sd100000002');
  await page.getByRole('button', { name: 'Track' }).click();
  await expect(page).toHaveURL(/\/track\/SD100000002$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tracking SD100000002');
});

test('API health is reachable through the gateway', async ({ request }) => {
  const res = await request.get('/api/v1/health');
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).checks.db).toBe(true);
});

test('portal routes redirect to login without a session', async ({ page }) => {
  await page.goto('/customer');
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomer/);
});

test('dev login as customer lands on /customer and cannot open /admin @mobile', async ({
  page,
}) => {
  await page.goto('/login');
  await page
    .getByTestId('dev-login')
    .getByRole('button', { name: /Nimali Customer/ })
    .click();
  await expect(page).toHaveURL(/\/customer$/);
  await expect(page.getByRole('heading', { name: 'My deliveries' })).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/customer$/);
});
