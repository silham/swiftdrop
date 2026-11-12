# SwiftDrop

Parcel delivery & courier management system: customer bookings, live tracking, dispatcher
assignment, courier proof of delivery, merchant partner API with webhooks, and operational reporting.

**Stack**

- Next.js 16 · NestJS 11 (modular monolith) · PostgreSQL 17 + Prisma 7
- RabbitMQ (transactional outbox) · SSE · Docker Compose · Jest/Supertest/Playwright

> 🤖 Working with an AI coding agent? Point it at [AGENTS.md](AGENTS.md) and your brief in
> [docs/members/](docs/members/).

## Quick start

Prerequisites: Docker Desktop (≥ 4 GB RAM for Docker), `make`, git. Node is **not** required on the host.

```bash
git clone <repo-url> swiftdrop && cd swiftdrop
make up          # first run builds images, installs deps, migrates and seeds (~3–5 min)
make ps          # wait until api, web and worker show (healthy)
```

| What                   | URL                                                  |
| ---------------------- | ---------------------------------------------------- |
| App                    | http://localhost:8080                                |
| API docs (Swagger)     | http://localhost:8080/api/docs                       |
| RabbitMQ               | http://localhost:15672 (swiftdrop / swiftdrop)       |
| Mailpit (emails)       | http://localhost:8025                                |
| Object storage console | http://localhost:9001 (swiftdrop / swiftdrop-secret) |

**Test accounts.** The password for all of them is `Password123!`. In dev, `/login` also has a one-click
Dev login panel.

| Email                                              | Role                |
| -------------------------------------------------- | ------------------- |
| admin@swiftdrop.test                               | Admin               |
| dispatcher@swiftdrop.test                          | Dispatcher          |
| courier1@swiftdrop.test / courier2@swiftdrop.test  | Courier             |
| customer@swiftdrop.test / customer2@swiftdrop.test | Customer            |
| merchant@swiftdrop.test                            | Merchant (approved) |

Demo tracking numbers: `SD100000001`, `SD100000002`, `SD100000003`.

## Everyday commands

```bash
make help            # all targets
make logs s=api      # follow a service's logs
make sh s=api        # shell inside a container
make install         # after pulling dependency / contracts / schema changes
make migrate-deploy  # after pulling new migrations
make check           # lint + typecheck + unit + integration + migration drift (run before PRs)
make e2e             # Playwright journeys
make down            # stop (data is kept)
```

## Repository layout

```
apps/api        NestJS API (modules: auth, users, bookings, parcels, pricing, dispatch, courier, merchants, merchant-api, reports, audit, event-ops)
apps/worker     outbox relay + notification and webhook consumers
apps/web        Next.js portals: customer, merchant, courier, dispatch, admin
apps/e2e        Playwright tests
packages/contracts  shared enums, status graph, event schemas, error codes
packages/db     Prisma schema (split per module), migrations, seed
docker/         Dockerfile (dev + prod targets), Caddy gateway, Postgres init
docs/           architecture, ADRs, conventions, contracts, member briefs
```

## Documentation

- [AGENTS.md](AGENTS.md): rules, ownership map, patterns (start here)
- [docs/architecture/overview.md](docs/architecture/overview.md): architecture, scope and the
  [ADRs](docs/architecture/adr/)
- [docs/conventions/](docs/conventions/): API, errors, database migrations, events, testing, security, frontend, git
- [docs/contracts/](docs/contracts/): parcel lifecycle, authorization matrix, event catalog, endpoint list
- [docs/members/](docs/members/): one brief per team member
- [docs/TEAM.md](docs/TEAM.md): who is who
- [docs/report/](docs/report/): test report, demo script, use cases, activity diagrams, contribution sheet
- [docs/release-checklist.md](docs/release-checklist.md): what to check before a demo or release
- [docs/partner-api.md](docs/partner-api.md) and [docs/security-review.md](docs/security-review.md)

## Known limitations

- Google sign-in needs real credentials in `.env`; without them the button answers "not configured".
- SMS is a mock provider that writes a log line. Email goes to Mailpit.
- The seeded proof of delivery for `SD100000003` has no photo file (object storage isn't part of the
  seed), so its photo view says "not available". Photos taken through the courier screens work.
- Kubernetes manifests and the AI delivery assistant (the P2 stretch goals) are not built.
- The `make e2e` suite needs the dev stack running and takes a few minutes, mostly page compilation.
- `make prod-up` serves plain HTTP on localhost. Cookies are marked `Secure` there, which Safari
  refuses over HTTP: run `PROD_COOKIE_SECURE=false make prod-up` for Safari, or put it behind HTTPS.

## Troubleshooting

| Problem                                                         | What to do                                                                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot connect to the Docker daemon`                           | Start Docker Desktop, wait until it says it is running, then `make up`. Data is kept in volumes.                                                          |
| Port already in use (8080, 5432, 5672, 15672, 8025, 9000, 9001) | Stop whatever uses it (`lsof -i :8080`) or stop the other project. `make down` stops this stack.                                                          |
| `make up` is very slow or containers restart                    | Give Docker Desktop at least 4 GB RAM (Settings → Resources). The first start builds images and installs packages (3–5 minutes).                          |
| The page shows an old version or a build error after `git pull` | `make install` (dependencies, shared packages), `make migrate-deploy` (new migrations), then `make restart`.                                              |
| `make gen` or typecheck fails on `schema.d.ts`                  | The API types are generated: run `make gen` after any API change.                                                                                         |
| Tests fail with a database error                                | The integration tests use their own `swiftdrop_test` database and reset it on every run. Make sure `make ps` shows postgres healthy and rabbitmq healthy. |
| Integration tests behave oddly while the stack is running       | They talk to the same RabbitMQ as the dev stack. If an events test fails once, run `make test-int` again; a persistent failure is a real bug.             |
| `git commit` fails with `pnpm: command not found` (husky hook)  | The editor's git can't see `pnpm`. Start VS Code from a terminal where `pnpm` works (`code .`), or add the folder containing `pnpm` to the hook's PATH.   |
| Emails don't arrive                                             | Open Mailpit (http://localhost:8025). If it is empty, check the worker: `make logs s=worker`.                                                             |
| Live tracking never says "Live"                                 | The browser falls back to polling every 15 seconds if the event stream can't connect. Check `make logs s=api` and that RabbitMQ is healthy.               |
| Signed out right after login in the prod stack                  | Secure cookies over plain HTTP: see "Known limitations" (`PROD_COOKIE_SECURE=false`).                                                                     |
| Dev login panel missing on `/login`                             | It only shows when `ENABLE_DEV_LOGIN=true` (default in `.env.example`) and never in production mode.                                                      |
| I need a clean database                                         | Ask the team lead first: `make db-reset` and `make nuke` delete data and are never run by the coding agents.                                              |
