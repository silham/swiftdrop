import { expect, test } from '@playwright/test';

/** Theme + sidebar shell. Owner: M10 (shell: M1). */
test('theme choice persists across a reload', async ({ page }) => {
  await page.goto('/track');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  await page.getByRole('radio', { name: 'Dark theme' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('admin sidebar navigates and marks the active page', async ({ page }) => {
  await page.goto('/login');
  await page
    .getByTestId('dev-login')
    .getByRole('button', { name: /Ada Admin/ })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
  const sidebar = page.getByRole('navigation', { name: 'Main' });
  await sidebar.getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await expect(sidebar.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
});

test('mobile navigation drawer opens @mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'drawer is only used on small screens');
  await page.goto('/login');
  await page
    .getByTestId('dev-login')
    .getByRole('button', { name: /Nimali Customer/ })
    .click();
  await expect(page).toHaveURL(/\/customer$/);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  await drawer.getByRole('link', { name: 'Book a delivery' }).click();
  await expect(page).toHaveURL(/\/customer\/book$/);
});
