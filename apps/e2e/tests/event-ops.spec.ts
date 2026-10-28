import { expect, test } from '@playwright/test';

/**
 * Event operations journey (M8): admins see the pipeline state on /admin/ops, everyone else is
 * kept out. Webhook retry, dead-lettering and notifications are covered by the API integration
 * tests in apps/api/test/events/.
 */
test('admin sees outbox, queues and webhook deliveries on /admin/ops', async ({ page }) => {
  await page.goto('/login');
  await page
    .getByTestId('dev-login')
    .getByRole('button', { name: /Ada Admin/ })
    .click();
  // Wait for the login redirect, so the session cookie is set before we navigate on.
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/ops');

  await expect(page.getByRole('heading', { name: 'Event operations' })).toBeVisible();
  await expect(page.getByText('Waiting to be published')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Queues' })).toBeVisible();
  await expect(page.getByText('webhooks.parcel-events.dlq')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Webhook deliveries' })).toBeVisible();

  // The status filter switches the list.
  await page.getByRole('link', { name: 'Succeeded' }).click();
  await expect(page).toHaveURL(/\/admin\/ops\?status=SUCCEEDED$/);
  await expect(page.getByRole('link', { name: 'Succeeded' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('a customer cannot open /admin/ops', async ({ page }) => {
  await page.goto('/login');
  await page
    .getByTestId('dev-login')
    .getByRole('button', { name: /Nimali Customer/ })
    .click();
  await expect(page).toHaveURL(/\/customer$/);
  await page.goto('/admin/ops');
  await expect(page).toHaveURL(/\/customer$/);
});

test('the ops API rejects anonymous callers', async ({ request }) => {
  for (const path of ['outbox', 'queues', 'webhook-attempts']) {
    expect((await request.get(`/api/v1/admin/ops/${path}`)).status()).toBe(401);
  }
});
