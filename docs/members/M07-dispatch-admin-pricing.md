# M07: Dispatch, admin & pricing

> **Kick-off prompt for your agent**
> "I am M7 on SwiftDrop. Read AGENTS.md, then docs/members/M07-dispatch-admin-pricing.md and
> docs/conventions/api.md. Implement my Week-N tasks only inside my owned paths. Find stubs with
> `grep -rn "TODO(M7)\|notImplemented('M7')" apps`. Write unit tests for pricing and assignment rules and
> integration tests including negative authorization cases, then run `make check`."

## Mission

Two areas, both operational:

1. **Pricing & zones.** You are the **source of truth for delivery fees** and the configurable zones and rules.
2. **Dispatch.** The unassigned queue, courier assignment, and courier workload.

## You own

- API: `apps/api/src/modules/pricing/`, `apps/api/src/modules/dispatch/`, `apps/api/test/{pricing,dispatch}/`
- `packages/db/prisma/schema/{pricing,dispatch}.prisma`, `packages/db/seed/10-zones-pricing.ts`
- Web: `src/app/dispatch/**`, `src/app/admin/zones/`, `src/app/admin/pricing/`, `src/features/{dispatch,pricing}/`

## Interfaces you provide

| Interface                                                                                                                                      | Used by                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `PricingService.estimate({ pickupCity, dropoffCity, size, weightKg }) → { feeCents, currency, pickupZoneId, dropoffZoneId, ruleId, ruleName }` | M4 (on create), web estimate (M3) |
| `DispatchService.getActiveAssignment(parcelId, tx?)` ✅ done                                                                                   | M6                                |
| `DispatchService.completeAssignment(parcelId, tx?)`                                                                                            | M6 (on DELIVERED)                 |

## Pricing rules (implement + unit test thoroughly)

1. **Resolve zones.** Lower-case and trim the city, then find the active zone whose `cities` contains
   it. If either city is unknown, throw 422 `ZONE_NOT_SERVICED` with details `{ city }`.
2. **Candidate rules** are active and inside `validFrom/validTo`. Each of `fromZoneId`, `toZoneId`
   and `size` must either match the parcel or be null (null is a wildcard).
3. **Pick the most specific rule.** Specificity is the number of non-null match fields (0–3). Break
   ties by highest `priority`, then by the newest rule. The seed has a default catch-all rule, so a
   rule always exists for serviced zones.
4. **Fee** = `baseFeeCents + perKgCents × ceil(weightKg)`, as an integer. Document the rounding.

The `POST /pricing/estimate` endpoint is public. Admin CRUD lives at `/admin/zones` and
`/admin/pricing-rules` (ADMIN, DISPATCHER). Every create/update writes an **audit** entry. Validate
`baseFeeCents >= 0`, that a zone code is unique, and that a city is not in two active zones.

## Dispatch rules

- **`GET /dispatch/unassigned`** returns parcels with status CREATED (or FAILED that needs a
  re-attempt) and **no ACTIVE assignment**. Filter by zone, oldest first, paginated. Show cities and
  size only; don't include recipient phone numbers here.
- **`POST /dispatch/assignments { parcelId, courierId }`** runs in **one transaction**:
  - the courier must be a user with role COURIER, an available `CourierProfile`, and active count < `maxActiveParcels` → otherwise `COURIER_UNAVAILABLE`;
  - the parcel must have no ACTIVE assignment → otherwise `ALREADY_ASSIGNED` (409);
  - then create the assignment, write the audit entry `parcel.assigned`, and call
    `outbox.enqueue('parcel.courier_assigned', …)`.
    To guard against races, lock the parcel row (`SELECT … FOR UPDATE` via `$queryRaw`) or re-check
    after the insert.
- **`DELETE /dispatch/assignments/:id`** sets CANCELLED, only while the parcel is still CREATED or
  PICKED_UP. Write an audit entry.
- **`GET /dispatch/couriers/workload`** lists every courier with zone, availability, active count and
  capacity.
- **Re-attempt flow** (with M4): FAILED → reassign, or move back to OUT_FOR_DELIVERY through
  `ParcelsService.transition` with the dispatcher as the actor.

## Web pages

- `/dispatch`: unassigned queue table with a zone filter, an "Assign" action, and a courier picker
  that shows workload (active/capacity). Refresh after assigning.
- `/dispatch/couriers`: workload table with capacity bars.
- `/admin/zones`, `/admin/pricing`: CRUD tables and forms, plus an active/inactive toggle. Add an
  "estimate preview" on the pricing page.
- These pages are reachable by DISPATCHER and ADMIN (`admin/layout.tsx` allows both).

## Tests required

- Unit (pricing):
  - specificity and priority selection;
  - wildcard handling;
  - validity window;
  - weight rounding;
  - unserviced city;
  - inactive zone.
- Unit (dispatch):
  - capacity check;
  - already-assigned check;
  - unassign allowed only in early statuses.
- Integration:
  - the estimate for the seeded Colombo→Colombo trip uses the "Within Colombo" rule;
  - assign → assignment + audit + outbox rows;
  - double assign → 409;
  - CUSTOMER/COURIER → dispatch endpoints = 403;
  - DISPATCHER → `/admin/users` = 403 (M2 matrix).

## Week-by-week

| Week | Tasks                                                                                      | Exit                                      |
| ---- | ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 1    | Agree the estimate contract with M3/M4 and the assignment contract with M6                 | Agreed                                    |
| 2    | `PricingService.estimate` + `/pricing/estimate`                                            | **Fee calculated** (vertical slice)       |
| 3    | Unassigned queue, assign/unassign, workload API + dispatch pages. Zones/pricing admin API. | **Booking → assignment → courier update** |
| 4    | Zones/pricing admin pages. Courier profiles for staff (with M2).                           | —                                         |
| 5    | Audit integration, re-attempt flow with M4                                                 | —                                         |
| 6    | Pricing edge cases, validation, polish                                                     | —                                         |
| 7    | Rule and assignment test matrix, E2E dispatcher spec                                       | Green                                     |
| 8    | Demo step 3, docs                                                                          | —                                         |

## Status / notes

- **Pricing Module**:
  - `PricingService.estimate`: Implemented zone resolution by city with case-insensitivity, candidate rule matching (wildcards, validity window), specificity scoring (0–3), priority and creation-date tie-breaking, and fee calculation with ceiling weight rounding (`baseFeeCents + perKgCents * ceil(weightKg)`).
  - Admin zones CRUD at `GET /api/v1/admin/zones`, `POST /api/v1/admin/zones`, `PATCH /api/v1/admin/zones/:id` with duplicate code prevention, active city overlap protection, and audit logging.
  - Admin pricing rules CRUD at `GET /api/v1/admin/pricing-rules`, `POST /api/v1/admin/pricing-rules`, `PATCH /api/v1/admin/pricing-rules/:id` with fee validation and audit logging.
  - Public `POST /api/v1/pricing/estimate` endpoint active.
- **Dispatch Module**:
  - `GET /api/v1/dispatch/unassigned`: Oldest-first unassigned parcel queue with optional zone filtering, paginated, omitting sensitive recipient PII.
  - `POST /api/v1/dispatch/assignments`: Transactional assignment validating parcel state (`CREATED` or `FAILED`), courier availability (`isAvailable = true`), active workload limit (`activeParcels < maxActiveParcels`), double-assignment prevention (`ALREADY_ASSIGNED` 409), recording audit entry (`parcel.assigned`), and enqueuing outbox event (`parcel.courier_assigned`).
  - `DELETE /api/v1/dispatch/assignments/:id`: Unassignment restricted to early statuses (`CREATED` or `PICKED_UP`), cancels assignment, and records audit entry (`parcel.unassigned`).
  - `GET /api/v1/dispatch/couriers/workload`: Fleet workload view returning active delivery count vs capacity limit.
  - `DispatchService.completeAssignment`: Marks active assignment `COMPLETED` upon parcel delivery.
- **Web Pages & Features**:
  - `/dispatch`: `UnassignedQueue` with zone filter, responsive table, and `AssignCourierModal` with live courier workload picker.
  - `/dispatch/couriers`: `CourierWorkload` with capacity utilization bars and fleet summary statistics.
  - `/admin/zones`: `ZonesManagement` with CRUD table, active/inactive toggle, and create/edit modal.
  - `/admin/pricing`: `PricingRulesManagement` with rules CRUD, active toggle, and interactive `EstimatePreview` calculator.
- **Testing**:
  - Unit tests for Pricing (`pricing.service.spec.ts`) covering specificity, priority tie-breaking, wildcards, validity windows, ceiling weight rounding, unserviced cities (422), and inactive zones.
  - Unit tests for Dispatch (`dispatch.service.spec.ts`) covering capacity checks, already-assigned checks, availability checks, unassignment status restrictions, and completion.
  - Integration tests for Pricing (`pricing.e2e-spec.ts`) and Dispatch (`dispatch.e2e-spec.ts`) including negative authorization matrix cases for non-privileged roles (`CUSTOMER`, `COURIER`).
