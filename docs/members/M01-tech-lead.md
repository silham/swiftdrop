# M01: Technical lead & backend foundation

> **Kick-off prompt for your agent**
> "I am M1, technical lead of SwiftDrop. Read AGENTS.md and docs/members/M01-tech-lead.md. Help me
> keep the foundation healthy, review PRs against the conventions, and coordinate integration.
> Don't implement other members' modules unless I explicitly say so."

## Mission

Own the architecture, shared conventions and the integration of ten parallel workstreams.
Your job is to **unblock**, **review** and **integrate**. The plan says it plainly: the lead
coordinates and must not become the bottleneck or build every shared component alone.

## What's already done (scaffold, Week 0)

- **Monorepo and tooling:** pnpm workspaces, TypeScript 6, ESLint (including the module-boundary
  rule), Prettier with lint-staged, husky.
- **API foundation:**
  - config validation (zod);
  - global error filter with the `{ error: { code, message, details, requestId } }` shape;
  - pino logging with redaction;
  - request IDs and Helmet, CORS, throttler;
  - Swagger;
  - `JwtAuthGuard` and `RolesGuard` with the `@Public`, `@Roles` and `@CurrentUser` decorators;
  - `TokenService`, `PrismaService`, `OutboxService`, `RabbitMqService`, `StorageService`;
  - `AuditService` (basic);
  - dev login-as.
- **Module stubs:** every module and endpoint from the plan is pre-registered with DTOs and
  `@Roles`, returning 501.
- **Data:** split Prisma schema with the full ER model, baseline migration and idempotent seeds.
- **Contracts:** roles, status graph, event schemas, error codes and API constants.
- **Worker skeleton:** RabbitMQ topology, consumers and relay loop (stubs), health server.
- **Web:** portals, layouts with server-side role checks, UI kit, typed OpenAPI client, dev login
  panel, proxy redirect.
- **Docker and CI:** Docker dev and prod targets, Caddy gateway, Makefile, CI workflow, CODEOWNERS,
  Playwright smoke tests.
- **Docs:** AGENTS.md, CLAUDE.md, ADRs, conventions, contracts, diagrams and all ten member briefs.

## You own

- `apps/api/src/{main.ts,app.module.ts,app.factory.ts,config/,common/}` (except `common/auth/`, which M2 owns after the handover)
- `apps/api/src/infra/prisma/`, `apps/api/src/modules/dev-login/`
- `packages/contracts/` (shared with M4 for the lifecycle and M8 for events), `packages/db/prisma/schema/base.prisma`, `packages/db/prisma/migrations/` (review)
- `apps/web/src/{components/,lib/api/}` (shared with M10), `apps/web/src/app/admin/layout.tsx`
- `AGENTS.md`, `CLAUDE.md`, `docs/architecture/`, `docs/conventions/`, `docs/contracts/`, `docs/diagrams/`

## Week 1 checklist (do these first)

- [ ] Fill in `docs/TEAM.md` and replace the `@swiftdrop-mNN` handles in `.github/CODEOWNERS`.
- [ ] Create the GitHub repo, push `main`, and set up branch protection: PR required, 1 review,
      CODEOWNER review, CI `checks` job required, no force push.
- [ ] Create the project board (Todo / In Progress / Review / Blocked / Done) and one issue per
      member-brief task.
- [ ] Kick-off meeting. Walk through AGENTS.md, and have every member run `make up` and log in with
      the dev login.
- [ ] **Day 1–2 decisions:**
  - status graph (M4 confirms `docs/contracts/parcel-lifecycle.md`);
  - event schema (M8 confirms `docs/contracts/event-catalog.md`);
  - role names and tenancy rules (M2, M5);
  - ER diagram sign-off (all);
  - email/SMS provider (Mailpit + mock SMS, M8);
  - proof-of-delivery storage (RustFS, M6).

  Record any change as a short ADR.

- [ ] Hand over `common/auth/` to M2 and `infra/events/` to M8.

## Ongoing duties

- **PR review.** Check boundaries (no deep imports, no edits outside owned paths), the security
  checklist, tests (including negative authorization) and error codes. Keep a review rota so you
  aren't the only reviewer: pair reviewers by dependency, e.g. M3↔M4, M5↔M8, M6↔M7, M2↔M9, M10↔anyone.
- **Integration checkpoints, twice a week.** `main` must pass `make check`, and you run the demo flow
  so far. Log the results in the team channel.
- **Contract freeze at the end of Week 2.** After that, approve or reject "contract change" issues.
  Only additive changes are allowed without a version bump.
- **Migrations.** Watch for migration ordering problems and enforce the rebase-and-regenerate rule.
- **Weekly demo.** Every week ends with a demo of working software.

## Milestones you are accountable for

| Week | Exit criterion                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------- |
| 1    | Repo boots for everyone. Migrations run. Health checks pass. Web and API talk (✅ scaffold).                         |
| 2    | **First vertical slice:** auth, create parcel, estimate fee, status history, tracking via the API. Contracts frozen. |
| 3    | Booking → assignment → courier status update on the shared environment.                                              |
| 4    | Merchant orders; courier status change shows on the tracking page (SSE).                                             |
| 5    | Status change → event → notification + webhook in a repeatable integration test.                                     |
| 6    | All required user journeys integrated in one release candidate.                                                      |
| 7    | Critical flows pass. Test and security evidence recorded.                                                            |
| 8    | Scope frozen. Design PDF, README, contribution sheet, rehearsed demo.                                                |

## Week 8 deliverables (you coordinate, everyone contributes)

- **Design PDF:**
  - use cases;
  - ER diagram (`docs/diagrams/er.md`);
  - architecture (`docs/diagrams/architecture.md`);
  - integration patterns (outbox, pub/sub, DLQ, webhooks);
  - sequence and activity diagrams;
  - design principles (ADRs).
- **Contribution sheet** (one row per member) and the **demo script**: follow the sequence in the
  plan PDF §9.
- **Remove the dev login** from the UI for the final demo by setting
  `NEXT_PUBLIC_ENABLE_DEV_LOGIN=false` and `ENABLE_DEV_LOGIN=false`.

## Status / notes

- Scaffold complete.
- The NestJS 11 vs 12 and TypeScript 6 vs 7 choices are explained in ADR-0006.
- MinIO's image is no longer published, so object storage uses RustFS (ADR-0005).
- Prisma blocks AI agents from `migrate reset`, so the integration-test setup truncates the
  `_test` database instead.

- 2026-11-13, bonus items built:
  - **AI assistant.** Tracking page chatbot over any OpenAI-compatible model (`modules/assistant`).
  - **MCP server.** Role-aware tools (`modules/ai-tools`) at `/mcp`, protected by our own OAuth 2.1
    server (`modules/oauth`, consent page `/oauth/authorize`); see ADR-0009.
  - **Kubernetes.** Helm chart in `deploy/helm/swiftdrop` (`make k8s-lint`).
  - **Hosting.** Coolify guide in `docs/deploy/`.
  - Owners whose files were touched for exports only: M3 `bookings/index.ts`, M6 `courier/index.ts`,
    M9 `reports/index.ts`. M2: the Google `next` cookie and `/oauth/:path*` in `proxy.ts`. M10:
    Caddyfile routes, `compose.prod.yaml`, Makefile `k8s-*`.
