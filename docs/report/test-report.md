# Test report

Branch `m01/p0-gaps` (P0 `a7c7929`, P1 `64a606c`, then the bonus items: AI assistant, MCP server, Helm chart), run on
2026-11-13 against the Docker stack. Every number below comes from a real run on that date; how to
reproduce each one is in the last column.

## Summary

| Suite                            | What it covers                                                                       | Result                                         | Command         |
| -------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- | --------------- |
| Unit: API                        | Business rules per service (no database)                                             | **274 passed** (26 suites)                     | `make test`     |
| Unit: worker                     | Outbox relay, retry decisions, signatures, templates, masking                        | **30 passed** (6 suites)                       | `make test`     |
| Unit: contracts                  | Status graph, event schemas                                                          | **3 passed** (1 suite)                         | `make test`     |
| Unit: web                        | Booking form logic, API mapping, parcel details render, proof photo, courier buttons | **15 passed** (5 files)                        | `make test`     |
| Integration: API                 | Real Postgres, RabbitMQ and object storage; every endpoint incl. negative auth       | **380 passed** (24 suites)                     | `make test-int` |
| Merged coverage (API)            | Unit + integration in one run                                                        | **lines 92.90 %** (threshold 88 %)             | `make coverage` |
| End to end (Playwright)          | User journeys through the browser, desktop and phone                                 | **31 passed**, 1 skipped (desktop 27, phone 4) | `make e2e`      |
| Production-like stack            | `make prod-up` smoke test                                                            | **passed** after two fixes (see section 5)     | see section 5   |
| Lint, typecheck, migration drift | Whole repository                                                                     | **0 errors** (6 old `any` warnings), no drift  | `make check`    |

## 1. Coverage

One Jest run executes the API unit and integration tests together (`apps/api/jest.all.config.js`)
and writes a single report to `apps/api/coverage/merged/index.html`.

| Metric     | Covered             | Threshold (run fails below it) |
| ---------- | ------------------- | ------------------------------ |
| Lines      | 92.90 % (1807/1945) | 88 %                           |
| Statements | 90.71 % (1984/2187) | 86 %                           |
| Functions  | 91.36 % (434/475)   | 87 %                           |
| Branches   | 80.88 % (897/1109)  | 75 %                           |

654 tests, 50 suites in that run. **The gate works:** running only the unit project against the same
thresholds gives 62.79 % lines and the command exits with code 1 ("does not meet global threshold").
Unit tests alone cover about two thirds of the API; the integration tests are what reach the
controllers, guards, transactions and the event path.

Worker and contracts have their own unit coverage (`pnpm --filter @swiftdrop/worker test:cov`).

## 2. What the integration tests prove

Highlights, by business rule (all in `apps/api/test/`):

| Area          | Checked                                                                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization | Every endpoint: anonymous → 401, wrong role → 403, someone else's resource → 404 (`auth-matrix`, plus per-module suites)                                                                                                                                                                                              |
| Sessions      | Refresh rotation, reuse detection revokes all sessions, `/auth/resume` redirects only to same-site paths, disabled accounts                                                                                                                                                                                           |
| Booking       | Real fee from the pricing rules (client fee rejected), CREATED history row and `parcel.created` event in the same transaction, customer only sees own parcels                                                                                                                                                         |
| Lifecycle     | Every invalid transition → 409, FAILED needs a reason, DELIVERED needs proof, max 3 attempts, concurrent updates → 409                                                                                                                                                                                                |
| Courier       | Cross-courier 404, upload checks (fake JPEG → 400, > 5 MB → 413, no photo → 422), proof + DELIVERED + assignment completed together, photo access rules                                                                                                                                                               |
| Dispatch      | Double assignment → 409, two simultaneous assignments → exactly one wins, capacity, failed-parcel rules, active assignment list                                                                                                                                                                                       |
| Live tracking | A committed status change travels outbox → relay → RabbitMQ → the API's SSE queue → an open HTTP stream; other parcels' updates never leak into a stream                                                                                                                                                              |
| Merchants     | API key only shown once, keys hashed, idempotent partner orders (201 then 200), cross-merchant 404, webhook audit with URL host only, paged attempts, rate limit                                                                                                                                                      |
| Events        | Relay order and retries, notification and webhook consumers, HMAC signature, retry queues and dead letter queue, admin re-send                                                                                                                                                                                        |
| Audit         | Zone, pricing, webhook, API key and dispatch changes write their audit entry in the same transaction; secrets never stored                                                                                                                                                                                            |
| MCP + OAuth   | Discovery documents, 401 + `WWW-Authenticate`, client registration rules, consent (no redirect to unregistered URIs), PKCE, single-use codes, refresh rotation and replay revocation, revocation, expired tokens, disabled users; tools per role; courier-vs-courier and customer-vs-customer refused through MCP too |
| AI assistant  | Model mocked: tool calls reach the real tracking service, only public tools offered, private tools refused, 503 without a key or when the model fails (no upstream detail leaked), input limits, rate limit                                                                                                           |

## 3. End-to-end journeys

`make e2e` on 2026-11-13: **31 passed, 1 skipped, 0 failed** in 1.3 minutes. The desktop project
(Chrome) ran 27 tests; the phone project (Pixel 7, tests tagged `@mobile`) ran 4. The skipped test is
the phone-only navigation drawer check, which the desktop project skips on purpose.

The suite signs every role in once through the real login API (`apps/e2e/global-setup.ts`), so it
does not depend on the dev login panel and stays under the login rate limit. Before each run it also
finishes parcels that earlier runs left with the demo courier, so the courier never hits their
capacity limit.

| Spec                                | Journey                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `delivery-journey.spec.ts`          | Customer books → dispatcher assigns in the UI → courier delivers with a photo → public tracking, proof photo and delivery email                  |
| `customer-booking.spec.ts`          | Booking form with server price, confirmation, My deliveries, PDF receipt, form validation                                                        |
| `courier-deliver.spec.ts`           | On a phone (`@mobile`): report a problem, re-attempt, photo required, deliver; another courier gets 404                                          |
| `live-tracking.spec.ts`             | Public tracking page updates without reload as the courier changes the status                                                                    |
| `merchant-api.spec.ts`              | Generate an API key in the portal, create an order with it (201, then 200 on retry), wrong key → 401                                             |
| `dispatch-unassign.spec.ts`         | Unassign from the Active assignments card; a parcel on the road can't be unassigned                                                              |
| `event-ops.spec.ts`                 | Admin sees outbox, queues and webhook attempts; a customer is kept out; the API rejects anonymous callers                                        |
| `ai-assistant.spec.ts`              | MCP consent: an AI app is approved and receives a code it can exchange for a token; unknown apps get an error page; chatbot on the tracking page |
| `smoke.spec.ts`, `ui-shell.spec.ts` | Landing page, tracking search, health, redirects, navigation on desktop and phone                                                                |

## 4. Static checks

`make check` runs ESLint (0 errors; 6 older `no-explicit-any` warnings in merchant code), the
TypeScript compiler for every package, all unit and integration tests, and the Prisma drift check
(schema files match the migrations). Prettier is checked in CI (`pnpm format:check`).

## 5. Production-like run

`make prod-up` (production images, `NODE_ENV=production`) on 2026-11-13. The first attempt showed
that the production images had never worked; two configuration bugs were fixed and the second
attempt passed every check:

1. **API and worker crashed on start** (`Cannot find module '/app/dist/main.js'`). The SWC builder
   kept the `src/` folder in its output (`dist/src/main.js`), while the Dockerfile and the `start`
   scripts run `dist/main.js`. Fix: `stripLeadingPaths` in `apps/{api,worker}/nest-cli.json`.
2. **Every page answered 502.** The Next.js server reads `PORT` from the shared `.env`, which is
   `4000` (the API's port), but the gateway proxies to `web:3000`. Fix: `PORT: '3000'` for the web
   service in `compose.prod.yaml`.

The production `migrate` step applies migrations but does not seed, so the database was seeded once
by hand for the test (`docker compose -f compose.prod.yaml run --rm migrate pnpm --filter
@swiftdrop/db seed`).

| Check                                                     | Result                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/v1/health`                                      | `db`, `rabbitmq`, `storage` all `true`                            |
| Dev login                                                 | `POST /api/v1/dev/login-as` → 404; no dev login panel on `/login` |
| Session cookies                                           | `sd_access` and `sd_refresh` are `HttpOnly; Secure; SameSite=Lax` |
| `/`, `/login`, `/track/SD100000002`                       | 200; the tracking page shows "In transit"                         |
| `/customer` without a session                             | 307 to `/api/v1/auth/resume?next=/customer` (then to `/login`)    |
| `/customer` with a session                                | 200, lists the customer's parcels                                 |
| Book → assign → picked up → in transit → out for delivery | 201, 201, 200, 200, 200; fee 55000 from the pricing rules         |
| Proof of delivery (PNG) → customer opens the photo        | 201 → 200 `image/png` (object storage works in production mode)   |
| Public tracking                                           | `DELIVERED`                                                       |
| Emails (worker → Mailpit)                                 | booking confirmed, out for delivery, delivered                    |
| Error body for an unknown parcel                          | `{ code, message, requestId }`, no stack trace                    |

Afterwards `make prod-down` and `make up`; the dev stack started normally with the new build layout,
and the final `make check` and `make e2e` above ran after these fixes.

## 6. Known gaps

- Two truly simultaneous identical partner orders can both answer 201. Only one parcel is created
  (the database's unique key stops the second), but the second caller isn't told it was a repeat.
- The seeded proof of delivery for `SD100000003` has no photo file; photos taken through the
  courier screens work and are covered by the tests above.
- Branch protection on `main` and real GitHub handles in `.github/CODEOWNERS` need a repository admin.
- The design document and diagrams exist as Markdown (`docs/report/`, `docs/diagrams/`); exporting
  them to PDF is still to do.
- The Playwright suite runs against the dev server, which compiles pages on first visit, so the very
  first run after `make up` can be slow; timeouts are set generously for that.
- The production `migrate` step does not seed data. That's right for a real deployment, but a demo on
  the production stack needs the seed command from section 5 once.
- Kubernetes: the Helm chart passes `helm lint` and kubeconform (17 manifests valid for Kubernetes
  1.34). It has not been deployed to a live cluster.
- The chatbot is tested with a mocked model. A live model needs `LLM_API_KEY`, and Claude and ChatGPT
  need the HTTPS deployment ([coolify.md](../deploy/coolify.md)).
