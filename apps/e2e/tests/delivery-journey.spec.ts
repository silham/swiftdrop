import { expect, test, type Page } from '@playwright/test';
import { PNG_1X1, apiAs, bookParcel, mailpitSubjects } from '../support/api';
import { authFile } from '../support/auth';

/**
 * The full demo, end to end (M10 + all owners): book → dispatcher assigns in the UI → courier works
 * the parcel to DELIVERED with a photo → public tracking, customer proof photo and the delivery
 * email all reflect it. Runs in order; each step builds on the one before.
 */
test.describe.configure({ mode: 'serial' });

test.describe('book → assign → deliver → notify', () => {
  let parcel: Awaited<ReturnType<typeof bookParcel>>;

  test('a customer books a parcel', async ({ playwright, baseURL }) => {
    const customer = await apiAs(playwright, baseURL, 'customer');
    parcel = await bookParcel(customer);
    expect(parcel.trackingNumber).toMatch(/^SD\d{9}$/);
    await customer.dispose();
  });

  test('the dispatcher assigns it to courier1', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('dispatcher') });
    const page = await context.newPage();
    await page.goto('/dispatch');
    await expect(page.getByRole('heading', { name: 'Assignment queue' })).toBeVisible();

    await openRowOnAnyPage(page, parcel.trackingNumber);
    await page
      .getByRole('table', { name: 'Assignment queue' })
      .getByRole('row', { name: new RegExp(parcel.trackingNumber) })
      .getByRole('button', { name: 'Assign Courier' })
      .click();

    const dialog = page.getByRole('dialog', { name: 'Assign Courier' });
    await dialog.getByRole('radio', { name: /Chamal Courier/ }).check();
    await dialog.getByRole('button', { name: 'Confirm Assignment' }).click();
    await expect(dialog).toBeHidden();
    await context.close();
  });

  test('courier1 picks up, ships and delivers it with a photo', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('courier1') });
    const page = await context.newPage();
    await page.goto('/courier');
    await page.getByRole('link', { name: new RegExp(parcel.trackingNumber) }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(parcel.trackingNumber);

    for (const [button, badge] of [
      ['Mark picked up', 'Picked up'],
      ['Mark in transit', 'In transit'],
      ['Out for delivery', 'Out for delivery'],
    ] as const) {
      await page.getByRole('button', { name: button }).click();
      await expect(page.getByText(badge).first()).toBeVisible();
    }

    await page.getByRole('button', { name: 'Mark delivered' }).click();
    const dialog = page.getByRole('dialog', { name: 'Mark delivered' });
    await dialog.getByLabel('Photo').setInputFiles({
      name: 'proof.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await dialog.getByRole('button', { name: 'Confirm delivery' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('This parcel has been delivered.')).toBeVisible();

    // It moves from "assigned" to the courier's history.
    await page.goto('/courier/history');
    await expect(page.getByText(parcel.trackingNumber)).toBeVisible();
    await context.close();
  });

  test('public tracking shows DELIVERED', async ({ page }) => {
    await page.goto(`/track/${parcel.trackingNumber}`);
    await expect(page.getByText('Delivered').first()).toBeVisible();
  });

  test('the customer can see the proof photo', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('customer') });
    const page = await context.newPage();
    await page.goto(`/customer/parcels/${parcel.id}`);
    await expect(page.getByAltText(`Proof of delivery for ${parcel.trackingNumber}`)).toBeVisible();
    await context.close();
  });

  test('a delivery email reaches the recipient', async () => {
    await expect
      .poll(() => mailpitSubjects(`to:${parcel.recipientEmail}`), { timeout: 45_000 })
      .toContainEqual(expect.stringContaining('was delivered'));
  });
});

/**
 * The queue is paginated, oldest first. Walk its pages until the parcel's row shows up. Everything is
 * scoped to the queue: the "Active assignments" card below has its own table and paginator.
 */
async function openRowOnAnyPage(page: Page, trackingNumber: string) {
  const queue = page.getByRole('table', { name: 'Assignment queue' });
  const row = queue.getByRole('row', { name: new RegExp(trackingNumber) });
  // The queue card comes first in the page, so its paginator is the first one.
  const pageLabel = page.getByText(/^Page \d+ of \d+$/).first();
  const next = page.getByRole('button', { name: 'Next page' }).first();
  for (let i = 0; i < 20; i++) {
    // Rows load after the page changes, so give each page a moment before moving on.
    const found = await row
      .waitFor({ state: 'visible', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return;
    if (!(await next.count()) || (await next.isDisabled())) break;
    const before = await pageLabel.textContent();
    await next.click();
    await expect(pageLabel).not.toHaveText(before ?? '');
  }
  await expect(row).toBeVisible();
}
