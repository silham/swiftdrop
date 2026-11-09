import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the full docker stack through the gateway.
 *   make e2e            (inside docker, base URL http://gateway)
 *   E2E_BASE_URL=http://localhost:8080 pnpm --filter @swiftdrop/e2e test:e2e   (from host)
 * Owner: M10. Each journey owner adds specs under tests/<journey>.spec.ts.
 */
export default defineConfig({
  testDir: './tests',
  // Logs in each demo role once and saves the session (see support/auth.ts).
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  // The stack runs the Next.js dev server, which compiles pages on first visit.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Fewer parallel browsers, so the dev server isn't compiling everything at once.
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
    navigationTimeout: 45_000,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // couriers use phones — keep the courier journeys green on mobile too
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
