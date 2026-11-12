# Release checklist

Run through this before a demo, a hand-in or a tag. Tick each box in the PR or in your notes; if a
step fails, fix it or write the reason down in the "Known gaps" section of the test report.

## 1. Code is healthy

- [ ] You are on up-to-date `main` (or the release branch) and `git status` is clean.
- [ ] `make check` passes: lint, typecheck, unit tests (API, worker, contracts, web), integration tests, migration drift check.
- [ ] `make coverage` passes (merged coverage above the thresholds in `apps/api/jest.all.config.js`).
- [ ] `make e2e` passes on both the desktop and mobile projects.
- [ ] CI is green on the same commit (checks, and e2e on `main`).
- [ ] No `TODO(Mx)` or `notImplemented(` left: `grep -rn "TODO(M[0-9]*)\|notImplemented(" apps packages --include='*.ts' --include='*.tsx'` (the only hits should be the helper itself and its test).

## 2. Contracts and data

- [ ] `make gen` leaves no uncommitted changes (generated files are ignored, but the API compiles against them).
- [ ] Every Prisma schema change has its migration folder; `pnpm --filter @swiftdrop/db migrate:diff` reports no drift.
- [ ] No breaking change to `packages/contracts` or a public API shape since the Week-2 freeze (or M1 approved it and the version was bumped).
- [ ] New environment variables are in `.env.example` and the zod schema (`apps/*/src/config/env.ts`).

## 3. Security

- [ ] Every endpoint has `@Roles` (or is deliberately `@Public`) and a negative authorization test (`docs/contracts/authorization-matrix.md`).
- [ ] No secrets, tokens, full addresses or phone numbers in logs, events, audit metadata or the repository (`git log -p | grep -i "secret\|password"` skim).
- [ ] `ENABLE_DEV_LOGIN=false` and `COOKIE_SECURE=true` in anything that is not a local laptop (the prod compose sets both).
- [ ] JWT and webhook encryption secrets are not the sample values from `.env.example`.
- [ ] Branch protection on `main`: pull request required, CI checks required, code owner review (repository settings; needs an admin).

## 4. Production-like run

- [ ] Stop the dev stack (`make down`), then `make prod-up` (set `PROD_COOKIE_SECURE=false` only for Safari over plain HTTP).
- [ ] `curl http://localhost:8080/api/v1/health` shows every check `true`.
- [ ] For a demo on this stack, seed once: `docker compose -f compose.prod.yaml run --rm migrate pnpm --filter @swiftdrop/db seed` (the prod migrate step doesn't seed).
- [ ] Dev login is not offered on `/login`; a real login works and stays signed in.
- [ ] Book a parcel as the customer, assign it, deliver it with a photo (the demo script steps 2 to 5).
- [ ] `make prod-down`, then `make up` to go back to the dev stack.

## 5. Demo readiness

- [ ] Demo accounts work (`docs/report/demo-script.md`); the demo tracking numbers show data.
- [ ] Mailpit shows the booking and delivery emails.
- [ ] RabbitMQ (http://localhost:15672) and `/admin/ops` show no dead-lettered messages you can't explain.
- [ ] Documentation is current: README, member brief "Status / notes", `docs/contracts/*`, `docs/report/*`, ADRs for any new decision.

## 6. Hand-in

- [ ] `docs/report/test-report.md` has this run's numbers (tests, coverage, journeys).
- [ ] `docs/report/contributions.md` and `docs/TEAM.md` are checked by every member.
- [ ] Diagrams and the demo script are exported to PDF if the assessment asks for a document.
- [ ] Tag the release: `git tag -a vX.Y -m "…"` (ask the team lead before pushing tags).
