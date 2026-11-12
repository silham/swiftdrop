# API endpoint inventory

All paths are prefixed with `/api/v1`. The live, authoritative schema is Swagger at
http://localhost:8080/api/docs. Every row exists as a stub from day 1. "Status" is updated by the
owner as they implement it.

| Method & path                                                                                                                                        | Roles                                | Owner | Status  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----- | ------- |
| GET /health                                                                                                                                          | public                               | M10   | ✅ done |
| GET /dev/users · POST /dev/login-as · POST /dev/logout                                                                                               | dev only                             | M1    | ✅ done |
| POST /auth/register · POST /auth/login · POST /auth/refresh · POST /auth/logout                                                                      | public                               | M2    | ✅ done |
| GET /auth/google · GET /auth/google/callback                                                                                                         | public                               | M2    | ✅ done |
| GET /users/me                                                                                                                                        | signed in                            | M2    | ✅ done |
| PATCH /users/me                                                                                                                                      | signed in                            | M2    | ✅ done |
| GET/POST /admin/users · PATCH /admin/users/:id                                                                                                       | ADMIN                                | M2    | ✅ done |
| POST /parcels · GET /parcels/mine · GET /parcels/:id · GET /parcels/:id/receipt                                                                      | CUSTOMER                             | M3    | ✅ done |
| GET /tracking/:tn · GET /tracking/:tn/events (SSE)                                                                                                   | public                               | M4    | ✅ done |
| POST /pricing/estimate                                                                                                                               | public                               | M7    | ✅ done |
| GET/POST /admin/zones · PATCH /admin/zones/:id                                                                                                       | ADMIN, DISPATCHER                    | M7    | ✅ done |
| GET/POST /admin/pricing-rules · PATCH /admin/pricing-rules/:id                                                                                       | ADMIN, DISPATCHER                    | M7    | ✅ done |
| GET /dispatch/unassigned · GET/POST /dispatch/assignments · DELETE /dispatch/assignments/:id · GET /dispatch/couriers/workload                       | DISPATCHER, ADMIN                    | M7    | ✅ done |
| GET /courier/parcels · GET /courier/parcels/:id · PATCH /courier/parcels/:id/status · POST /courier/parcels/:id/proof · GET /courier/history         | COURIER                              | M6    | ✅ done |
| GET /parcels/:id/proof/photo                                                                                                                         | COURIER, CUSTOMER, DISPATCHER, ADMIN | M6    | ✅ done |
| POST /merchants/register                                                                                                                             | public                               | M5    | ✅ done |
| GET /merchants/me · /me/api-keys (GET, POST, DELETE :id) · /me/webhooks (GET, POST, PATCH :id, DELETE :id, POST :id/rotate-secret, GET :id/attempts) | MERCHANT                             | M5    | ✅ done |
| GET /admin/merchants · POST /admin/merchants/:id/{approve,reject,suspend}                                                                            | ADMIN                                | M5    | ✅ done |
| POST /merchant/parcels · GET /merchant/parcels · GET /merchant/parcels/:tn                                                                           | X-Api-Key                            | M5    | ✅ done |
| GET /admin/reports/{deliveries,daily-volume,couriers}                                                                                                | ADMIN, DISPATCHER                    | M9    | ✅ done |
| GET /admin/audit-logs                                                                                                                                | ADMIN                                | M9    | ✅ done |
| GET /admin/ops/outbox                                                                                                                                | ADMIN                                | M8    | ✅ done |
| GET /admin/ops/webhook-attempts · POST /admin/ops/webhook-attempts/:id/retry                                                                         | ADMIN                                | M8    | ✅ done |
