# M10: DevOps & quality engineering

> **Kick-off prompt for your agent**
> "I am M10 on SwiftDrop. Read AGENTS.md, then docs/members/M10-devops-quality.md and docs/conventions/testing.md.
> Work only inside my owned paths (docker/, compose*.yaml, Makefile, .github/, apps/e2e/, health modules).
> Never run destructive Docker/DB commands without asking me first."

## Mission

A reproducible environment for everyone, CI that protects `main`, the cross-module test framework
(Playwright E2E, coverage), and the release and deployment checklist. You **coordinate** system-level
testing. You are **not** the only tester; every owner tests their own code.

## You own

- `docker/` (Dockerfile with dev/prod/migrate targets, Caddyfile, postgres init), `compose.yaml`, `compose.prod.yaml`, `Makefile`, `.dockerignore`
- `.github/` (CI workflow, CODEOWNERS file mechanics, templates)
- `apps/e2e/` (Playwright config, shared fixtures, smoke spec), plus coordination of the journey specs
- `apps/api/src/modules/health/`, `apps/worker/src/health/`
- Shared web UI kit `src/components/ui/` (with M1)

## Already in place (scaffold)

- **Dev stack:** `make up` runs everything. One dev image, bind mounts with hot reload, `node_modules`
  in named volumes, and one-shot `deps` and `migrate` services. All services have healthchecks, and
  the Caddy gateway on :8080 streams SSE without buffering.
- **Supporting services:** RustFS (S3) under the service name `minio`, Mailpit and the RabbitMQ
  management UI.
- **Makefile:** `make check` = lint + typecheck + unit + integration + drift check. Also `make e2e`
  (Playwright container, profile `e2e`) and `make coverage`.
- **CI (`.github/workflows/ci.yml`):**
  - format, lint, typecheck, Prisma drift check, unit tests with coverage, integration tests with coverage, and build;
  - Postgres and RabbitMQ service containers;
  - an E2E job on `main` and on PRs labelled `e2e`.
- **Production images:** prod Dockerfile targets plus `compose.prod.yaml` (not yet verified end to end;
  that's your Week 6–8 task).

## To do

1. **Week 1:** make sure every member gets `make up` working on their machine. Collect issues into a
   README "Troubleshooting" section: Docker memory ≥ 4 GB, port clashes, Apple Silicon vs x86,
   Windows (use WSL2 and keep the repo inside the Linux filesystem for hot reload).
2. **Branch protection:** with M1, require the `checks` job and CODEOWNER review.
3. **E2E framework:**
   - fixtures for logging in as each role (dev-login API, or real login once M2 lands; store
     `storageState` per role in `apps/e2e/.auth/`);
   - a helper to read Mailpit (`GET http://mailpit:8025/api/v1/messages`);
   - test-data helpers that create fresh parcels through the API.
4. **Journey specs** (one file per journey, written with the owner):
   - `customer-booking`;
   - `dispatch-assign`;
   - `courier-deliver @mobile`;
   - `live-tracking`;
   - `merchant-api`;
   - `notifications-webhooks`;
   - the full demo journey from plan §9.
5. **Coverage & reports:** merge unit and integration coverage, publish an HTML report artifact,
   and set a minimum threshold once the modules exist (start around 60 % and raise it).
6. **Production-like run:** verify `make prod-up` (standalone Next build, `pnpm deploy` output,
   migrate target). Run as non-root, keep images small, set `COOKIE_SECURE=true`.
7. **Release checklist** (`docs/release-checklist.md`):
   - versions pinned;
   - `.env` for the demo with fresh secrets and dev login off;
   - seed data and test accounts documented;
   - `docker compose up` from a clean clone timed;
   - known limitations listed.
8. **Stretch (P2, only after P0+P1 are stable):** Kubernetes manifests (`deploy/k8s/`) for api,
   worker, web, postgres, rabbitmq.

## Tests you coordinate

| Category           | Your role                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Unit / integration | Keep the harness healthy (`apps/api/test/utils`). Help owners when CI fails.                       |
| Authorization      | Make sure M2's matrix runs in CI. Report gaps.                                                     |
| End-to-end         | Own the Playwright framework and the full demo journey                                             |
| Failure handling   | With M8: duplicate events, unavailable endpoint, provider error                                    |
| Evidence           | Week 7 test report: coverage summary, list of test suites, the event-flow test output, screenshots |

## Week-by-week

| Week | Tasks                                                                                 | Exit                                       |
| ---- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1    | Everyone runs the stack. Branch protection. CI green on `main`. Troubleshooting docs. | **Repo boots for all; health checks pass** |
| 2    | E2E role fixtures, Mailpit helper; vertical-slice E2E                                 | Baseline tests pass                        |
| 3–5  | Journey specs with owners as features land. Keep CI fast (cache).                     | —                                          |
| 6    | Production images + `compose.prod.yaml` verified. Release candidate checklist.        | RC deployable                              |
| 7    | Lead cross-module QA, coverage report, flaky-test cleanup, security checks recorded   | **Critical flows pass; evidence recorded** |
| 8    | Clean-clone rehearsal, deployment notes, final test report                            | Reproducible deployment                    |

## Status / notes

- If a dev volume gets corrupted, `make nuke` asks for confirmation before wiping everything.
- The first `make e2e` downloads the Playwright image (~2 GB).
- **Delivered (P0/P1 pass):**
  - **E2E:** `apps/e2e` logs in each role once (`global-setup.ts`, saved sessions in `.auth/`, so the
    suite stays under the auth rate limit and works with dev login off), with helpers in `support/`.
    Specs: customer booking, the full book → assign → deliver → notify journey (including the Mailpit
    check), courier on a phone (`@mobile`), live tracking, merchant API, dispatcher unassign, plus the
    earlier smoke, ui-shell and event-ops specs. Timeouts are generous because the dev stack compiles
    pages on first visit.
  - **Coverage:** `make coverage` runs API unit + integration tests in one Jest run
    (`apps/api/jest.all.config.js`), writes one merged report and enforces minimum coverage. CI uses it.
  - **Web unit tests** now run in `make test` and in CI (`tsx` as a devDependency of `apps/web`).
  - **Prod compose** sets `COOKIE_SECURE=true` (override with `PROD_COOKIE_SECURE=false`).
  - **Production images fixed and verified** (`make prod-up`, see `docs/report/test-report.md` §5):
    API and worker built to `dist/src/` so they crashed on start (fixed with `stripLeadingPaths` in
    both `nest-cli.json`), and the web server listened on the API's port 4000 from `.env` so every
    page was a 502 (fixed with `PORT: '3000'` for the web service). The prod `migrate` step doesn't
    seed; seed once by hand for a demo.
  - **Docs:** README troubleshooting, `docs/release-checklist.md`, `docs/report/` (test report, demo
    script, use cases, activity diagrams, contribution sheet).
- **Still needs a repository admin:** branch protection on `main` (required PR, required checks, code
  owner review) and the real GitHub handles in `.github/CODEOWNERS`.
