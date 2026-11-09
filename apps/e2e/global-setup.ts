import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { request, type FullConfig } from '@playwright/test';
import { ACCOUNTS, PASSWORD, authFile, type Role } from './support/auth';

/**
 * Logs in every demo role once through the real login API and saves the cookies. Specs then start
 * already signed in with `test.use({ storageState: authFile('courier1') })`. This keeps the suite
 * under the auth rate limit (10 logins/min per route) and works with dev login switched off.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:8080';
  for (const role of Object.keys(ACCOUNTS) as Role[]) {
    // One cookie jar per role.
    const api = await request.newContext({ baseURL });
    try {
      const res = await api.post('/api/v1/auth/login', {
        data: { email: ACCOUNTS[role], password: PASSWORD },
      });
      if (!res.ok()) throw new Error(`E2E login failed for ${role}: HTTP ${res.status()}`);
      mkdirSync(dirname(authFile(role)), { recursive: true });
      await api.storageState({ path: authFile(role) });
    } finally {
      await api.dispose();
    }
  }
}
