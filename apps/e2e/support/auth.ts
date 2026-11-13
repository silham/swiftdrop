import { join } from 'node:path';

/** Demo accounts from AGENTS.md (password is the same for all). */
export const PASSWORD = 'Password123!';

export const ACCOUNTS = {
  admin: 'admin@swiftdrop.test',
  dispatcher: 'dispatcher@swiftdrop.test',
  courier1: 'courier1@swiftdrop.test',
  customer: 'customer@swiftdrop.test',
  merchant: 'merchant@swiftdrop.test',
} as const;

export type Role = keyof typeof ACCOUNTS;

/** Saved browser session for a role, written by global-setup.ts. Gitignored (apps/e2e/.auth/). */
export const authFile = (role: Role) => join(__dirname, '..', '.auth', `${role}.json`);
