# M05: Merchant portal & partner API

> **Kick-off prompt for your agent**
> "I am M5 on SwiftDrop. Read AGENTS.md, then docs/members/M05-merchant-portal-api.md, docs/conventions/security.md
> (API keys, webhook secrets) and docs/conventions/events.md (webhooks). Implement my Week-N tasks only inside
> my owned paths. Find stubs with `grep -rn "TODO(M5)\|notImplemented('M5')" apps`. Write unit + integration
> tests including cross-merchant negative cases, then run `make check`."

## Mission

The merchant journey:

1. The merchant registers.
2. An admin approves the merchant.
3. The merchant creates parcels through a **secured, versioned partner API**.
4. The merchant receives delivery-status webhooks.

You also own the merchant dashboard, API-key lifecycle, webhook configuration and the partner API docs.

## You own

- API: `apps/api/src/modules/merchants/` (portal + admin approval), `apps/api/src/modules/merchant-api/` (partner API, `ApiKeyGuard`), `apps/api/test/merchants/`
- `packages/db/prisma/schema/merchant.prisma`, `packages/db/seed/20-merchants.ts`
- Web: `src/app/merchant/**`, `src/app/(public)/merchant-signup/`, `src/app/admin/merchants/`, `src/features/merchant/`
- Docs: `docs/partner-api.md` (create it; partner-facing guide)

## Interfaces you provide

| Interface                                                                                                                                                                                         | Used by              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `MerchantsService.verifyApiKey(raw): Promise<merchantId \| null>`                                                                                                                                 | `ApiKeyGuard`        |
| Webhook endpoint records (`WebhookEndpoint`, encrypted secret) + a small `decryptWebhookSecret()` helper. Export it from `merchants/index.ts`, or put a copy in the worker after agreeing with M8 | M8 webhooks consumer |
| `GET /merchants/me/webhooks/:id/attempts` reads `WebhookAttempt` rows written by M8                                                                                                               | merchant UI          |

## Interfaces you consume

`UsersService.createUser` (M2); `ParcelsService.create` / `findByTrackingNumber` (M4); `AuditService.record` (M9).

## Endpoints (all stubs exist)

**Portal** (cookie session, role MERCHANT; the merchant is always `ownerUserId = user.id`):

- `POST /merchants/register` (public): in **one transaction**, `createUser({ role: 'MERCHANT' })` +
  a `Merchant` with status `PENDING`. Don't auto-login, or do so but show a pending banner. Your choice;
  document it.
- `GET /merchants/me`: profile plus status.
- **API keys:**
  - `GET` lists them, showing the prefix only;
  - `POST` creates one and **returns the raw key once**: `sd_live_<8-char prefix>_<base64url(32 random bytes)>`.
    Store the `prefix` and `sha256(raw)`;
  - `DELETE` sets `revokedAt`. Audit both creation and revocation.
- **Webhooks:**
  - CRUD for endpoints. Validate the URL (https only in production; allow `http://` for local testing);
  - on create and on `rotate-secret`, generate a 32-byte secret and **return it once**. Store it
    AES-256-GCM-encrypted with `WEBHOOK_SECRET_ENC_KEY`. On rotate, keep the old one in
    `previousSecretEncrypted`;
  - `GET :id/attempts` returns the delivery attempts (paginated).

**Admin** (ADMIN): `GET /admin/merchants?status=`, `POST :id/approve | reject | suspend`. Each sets the
status plus `approvedAt`/`approvedById` and writes an **audit** entry.

**Partner API** (`@Public()` + `ApiKeyGuard`, header `X-Api-Key`):

- `verifyApiKey`:
  - parse the prefix → find the key;
  - compare hashes with `crypto.timingSafeEqual`;
  - reject revoked keys and merchants that aren't `APPROVED` (`MERCHANT_NOT_APPROVED`);
  - update `lastUsedAt` (throttled, e.g. at most once a minute).
- `POST /merchant/parcels`: `MerchantCreateParcelDto` with `merchantReference`. **Idempotent**: if
  `(merchantId, merchantReference)` exists, return it (200). Otherwise call
  `parcels.create({ source: 'MERCHANT_API', merchantId: req.merchantId })` (201).
- `GET /merchant/parcels` lists **own** parcels (paginated); `GET /merchant/parcels/:trackingNumber`
  returns 404 if the parcel isn't theirs.
- Consider stricter per-key throttling (`@Throttle`).

## Web pages

- `/merchant-signup`: the registration form.
- `/merchant`: dashboard with an approval-status banner (PENDING / REJECTED / SUSPENDED), counts of
  orders by status, and recent orders. Add a session-based list endpoint under `/merchants/me/parcels`
  if you need one. That's your module.
- `/merchant/orders`: table with filters.
- `/merchant/api-keys`: create (show the raw key once with a copy button and a warning), list, revoke.
- `/merchant/webhooks`: endpoints, rotate secret (shown once), recent attempts with status codes.
- `/admin/merchants`: approval queue (ADMIN), with approve/reject/suspend.

## Partner docs (`docs/partner-api.md`)

Cover: authentication with `X-Api-Key`, the create/list/get examples (curl), the idempotency rule,
the error format, the webhook payload, and **how to verify the signature** (with a Node snippet).
Swagger tag `merchant-api` with `@ApiSecurity('merchant-api-key')` is already set.

## Tests required

- Unit: key generation and parsing; hash compare; secret encrypt/decrypt round-trip; URL validation.
- Integration (`test/merchants/`):
  - register → PENDING;
  - a PENDING merchant's key → 403 `MERCHANT_NOT_APPROVED`;
  - admin approve → audit row;
  - create key → raw key works once listed only by prefix;
  - revoked key → 401;
  - **merchant A's key → merchant B's parcel = 404**;
  - a `merchantId` in the body is rejected;
  - idempotent create returns the same tracking number;
  - non-admin approve → 403.

## Week-by-week

| Week | Tasks                                                                                   | Exit                                    |
| ---- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| 1    | Tenancy rules with M2, the webhook payload/signature contract with M8                   | Agreed                                  |
| 3    | Merchant registration + admin approval (API + pages)                                    | Admin approves a merchant               |
| 4    | API-key lifecycle, partner API create/list/get, merchant dashboard                      | **Merchant creates orders via the API** |
| 5    | Webhook endpoint config + secret rotation. Integration with M8's delivery. Attempts UI. | Webhook received by a test endpoint     |
| 6    | Partner docs, rate limits, polish                                                       | —                                       |
| 7    | Cross-merchant negative tests, E2E merchant spec                                        | Green                                   |
| 8    | Demo step 7, docs                                                                       | —                                       |

Tip for demos: a webhook receiver such as `https://webhook.site` or a tiny local container shows
deliveries live. M8 may add a `webhook-echo` dev service.

## Status / notes

- **Task Group 1 Completed (Merchant Account & Admin Approval API)**:
  - Implemented `POST /merchants/register` (creates user with role `MERCHANT` and merchant in `PENDING` status).
  - Implemented `GET /merchants/me` (retrieves merchant profile and approval status for authenticated merchant).
  - Implemented `GET /admin/merchants` (paginated list of merchants with optional status filter).
  - Implemented `POST /admin/merchants/:id/approve` (sets status to `APPROVED`, records `approvedAt`, `approvedById`, and writes audit log via `AuditService`).
  - Implemented `POST /admin/merchants/:id/reject` (sets status to `REJECTED`, records optional reason, and writes audit log).
  - Implemented `POST /admin/merchants/:id/suspend` (sets status to `SUSPENDED` and writes audit log).
  - Added unit tests (`merchants.service.spec.ts`) and integration tests (`apps/api/test/merchants/merchants.e2e-spec.ts`).
