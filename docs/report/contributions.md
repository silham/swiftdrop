# Contribution sheet

**Drafted from the git history on `main` and the working branch; each member should confirm their own
row before submission.** The size column counts lines added in the member's merged PR (generated files
and lock files included, so treat it as a rough size, not a score).

## Merged work

| Member | Name                         | Merged PR / commit                                                              | Delivered                                                                                                                                                                                | Lines added |
| ------ | ---------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| M1     | Shakil Ilham                 | `bd3262c` scaffold; `04f4260` (#9); UI redesign `ebee7c1`, `2f4e2b7`, `b4313d2` | Monorepo, API foundation (guards, errors, config, logging), contracts, Prisma schema, Docker and CI scaffold, conventions, ADRs; RabbitMQ error fix; the visual redesign of every portal | n/a         |
| M2     | Jisfaaz Ahmed                | #1 `26f3e99`, #6 `9392fab`                                                      | Register, login, refresh rotation with reuse detection, Google OAuth, admin user management (API and UI), guard checks, auth tests, security review                                      | ~2,700      |
| M3     | Saajid Abdeen                | #4 `2d40b8e`                                                                    | Customer portal, booking flow with fee estimate, "My deliveries", parcel details, PDF receipts, tests                                                                                    | ~2,200      |
| M4     | Mishal Safeek                | #3 `0deb2ff`                                                                    | Parcel creation and status transitions (one transaction with history and event), public tracking, live SSE tracking, tracking pages, tests                                               | ~1,600      |
| M5     | Hashini Fernando             | #7 `73ae197`                                                                    | Merchant sign-up and approval, API keys, webhook endpoints, partner API with idempotency, SSRF guard, merchant portal, partner API guide                                                 | ~4,800      |
| M7     | Rassahi98                    | #8 `f2618f1`                                                                    | Pricing service (zones and rules), courier assignment with row locks, workload, dispatch and pricing admin screens, tests                                                                | ~3,700      |
| M8     | Gishani Nethmini Kirillawala | #5 `e5971ae`                                                                    | Outbox relay, RabbitMQ topology with retry queues and DLQ, notification and webhook consumers, event operations screen, tests                                                            | ~3,000      |
| M9     | Ilha-Sanoon                  | #10 `a2bb53f`                                                                   | Reports API and screens, audit log API and screen, admin overview, tests                                                                                                                 | ~3,100      |
| M6     | _(no merged PR)_             | n/a                                                                             | See "Work done on branch `m01/p0-gaps`" below                                                                                                                                            | n/a         |
| M10    | _(no merged PR)_             | n/a                                                                             | Scaffold CI and Docker by M1; see below for the e2e suite, coverage and prod compose                                                                                                     | n/a         |

## Work done on branch `m01/p0-gaps` (merged through the final pull request)

Done by M1 with an AI coding agent, to close the gaps found when the plan was compared with the
code. Listed per area so the owners can review their parts:

| Area          | Change                                                                                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M6 courier    | The whole courier module: assigned list, status updates, proof of delivery with file checks and cleanup, photo viewing rules, history, three mobile pages, 25 integration and 28 unit tests                                             |
| M7 dispatch   | Failed-parcel rules (no reassigning after three attempts; unassign allowed for failed parcels), list of active assignments with an Unassign button, audit entries in the same transaction, date-window check on pricing rules           |
| M2 auth       | Silent session refresh: `/auth/resume` for page loads and a retry in the client API; admin users status filter; Google sign-in and password policy unit tests                                                                           |
| M3 customer   | Live status on the parcel page; un-mocked booking integration test                                                                                                                                                                      |
| M4 parcels    | SSE end-to-end integration test through RabbitMQ; seed data for the demo parcels                                                                                                                                                        |
| M5 merchants  | Audit for webhook endpoint changes, paged delivery attempts, rate limits, partner API create test                                                                                                                                       |
| M10 quality   | Playwright suite (login once per role, helpers, 6 new journey specs), web unit tests run in CI, merged coverage with a threshold, secure cookies in the prod compose, README and docs                                                   |
| M1 bonus: AI  | Shared role-aware tool registry; tracking page chatbot over any OpenAI-compatible model; MCP server for Claude and ChatGPT with SwiftDrop as its own OAuth 2.1 authorization server (DCR, PKCE, consent page, token rotation); ADR-0009 |
| M1 bonus: K8s | Helm chart (ConfigMap, Secret, Services, Ingress, StatefulSets, seed Job), `make k8s-*` targets, Coolify hosting guide and an env-driven prod compose                                                                                   |
| M2 auth       | Google sign-in sequence diagram; `next` kept through Google sign-in                                                                                                                                                                     |

## Team process

Pull requests were merged between 2026-10-26 and 2026-11-07 (see the commit list above). Task board,
standups and checkpoint notes are not kept in the repository; add them here if the assessment asks
for that evidence.
