# M06: Courier application

> **Kick-off prompt for your agent**
> "I am M6 on SwiftDrop. Read AGENTS.md, then docs/members/M06-courier-app.md, docs/contracts/parcel-lifecycle.md,
> ADR-0005 and docs/conventions/security.md (uploads). Implement my Week-N tasks only inside my owned paths.
> Find stubs with `grep -rn "TODO(M6)\|notImplemented('M6')" apps`. Write unit + integration tests including
> cross-courier negative cases, then run `make check`."

## Mission

A **mobile-friendly** courier workflow: sign in → see assigned deliveries → update permitted statuses
→ capture **proof of delivery** (recipient name + photo) or a **failure reason** → view history.

## You own

- API: `apps/api/src/modules/courier/` (CourierService, CourierController, ProofViewController), `apps/api/src/infra/storage/` (StorageService), `apps/api/test/courier/`
- `packages/db/prisma/schema/courier.prisma` (ProofOfDelivery)
- Web: `src/app/courier/**`, `src/features/courier/`

## Interfaces you consume

| From | Interface                                                                                 |
| ---- | ----------------------------------------------------------------------------------------- |
| M7   | `DispatchService.getActiveAssignment(parcelId, tx?)`, `completeAssignment(parcelId, tx?)` |
| M4   | `ParcelsService.transition(parcelId, { to, actor, failureReason?, note?, tx })`           |
| M1   | `StorageService.put/get/remove` (you own it from now on)                                  |

## Endpoints (stubs exist)

**Authorization pattern for every courier endpoint:** load the ACTIVE assignment for the parcel. If
it's missing or `assignment.courierId !== user.id`, return **404**.

| Endpoint                            | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /courier/parcels`              | Parcels with an ACTIVE assignment to me. Show the fields a courier needs: addresses, recipient name and phone, size, status.                                                                                                                                                                                                                                                                                                          |
| `GET /courier/parcels/:id`          | One assigned parcel plus history                                                                                                                                                                                                                                                                                                                                                                                                      |
| `PATCH /courier/parcels/:id/status` | `CourierStatusUpdateDto` (`PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `FAILED` + `failureReason`). Delegate to `transition`. M4 enforces the graph.                                                                                                                                                                                                                                                                                |
| `POST /courier/parcels/:id/proof`   | multipart with `photo` + `recipientName` + `notes?`. Check size ≤ `UPLOAD_MAX_BYTES` and **magic bytes** (jpeg/png/webp, not the client's mimetype). Object key `pod/<parcelId>/<uuid>.<ext>`. Then, in **one transaction**: create `ProofOfDelivery` + `transition(DELIVERED, tx)` + `completeAssignment(tx)`. If the transaction fails, delete the uploaded object. Errors: `UNSUPPORTED_FILE`, `FILE_TOO_LARGE`, `PROOF_REQUIRED`. |
| `GET /courier/history`              | My completed (DELIVERED or FAILED) assignments, paginated                                                                                                                                                                                                                                                                                                                                                                             |
| `GET /parcels/:id/proof/photo`      | Stream the photo. Allowed for: the courier who captured it, DISPATCHER/ADMIN, and the owning customer. Everyone else gets 404. Set `Cache-Control: private, no-store`.                                                                                                                                                                                                                                                                |

The multer limit in the controller is 5 MB. Keep it consistent with `UPLOAD_MAX_BYTES`, and
consider moving the check into a reusable pipe.

## Web (mobile first: test at 375 px width)

- `/courier`: card list of assigned deliveries with big tap targets, status badges and the next-action button.
- `/courier/parcels/[id]`:
  - details, with phone as a `tel:` link and address as a maps link;
  - the action buttons for the allowed next status;
  - a **Failed** dialog with a reason select (`FAILURE_REASONS`) and a note;
  - a **Deliver** form with recipient name and a photo input `accept="image/*" capture="environment"`;
  - upload progress and errors.
- `/courier/history`: past deliveries.

## Tests required

- Unit: magic-byte detection; which status buttons appear for each status (pure function).
- Integration (`test/courier/`):
  - **courier2 cannot see or update courier1's parcel (404)**;
  - an unassigned parcel → 404;
  - a valid status update creates a history row;
  - FAILED without a reason → 422;
  - proof upload with a PNG → DELIVERED + ProofOfDelivery + assignment COMPLETED;
  - a text file renamed `.jpg` → 400 `UNSUPPORTED_FILE`;
  - more than 5 MB → rejected;
  - a customer can view the photo of their own delivered parcel; another customer gets 404.
- E2E with M10 (mobile project, tag `@mobile`): courier marks a parcel delivered with a photo.

## Week-by-week

| Week | Tasks                                                                                  | Exit                                      |
| ---- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1    | Confirm the storage approach (RustFS/S3, ADR-0005) and the assignment contract with M7 | Agreed                                    |
| 3    | Assigned list + status updates (API + UI)                                              | **Booking → assignment → courier update** |
| 4    | Proof of delivery upload + failure reasons                                             | Courier completes a delivery with a photo |
| 5    | Proof photo viewing for customer and dispatcher; history                               | —                                         |
| 6    | Mobile polish, error states                                                            | —                                         |
| 7    | Negative tests, upload validation tests, E2E mobile spec                               | Green                                     |
| 8    | Demo step 4, docs                                                                      | —                                         |

## Status / notes

Implemented (all six endpoints, web pages, tests):

- **API** (`apps/api/src/modules/courier/`): every endpoint first loads the ACTIVE assignment and
  returns 404 unless it belongs to the caller. List/detail responses carry `nextStatuses` and
  `canDeliver`, computed by `courier-actions.ts` from the lifecycle graph and the attempt cap, so the
  web never offers a button the API would reject.
- **Status updates** go through `ParcelsService.transition` inside one transaction. FAILED keeps the
  assignment so the **same courier can re-attempt** (FAILED → OUT_FOR_DELIVERY, up to 3 attempts). The
  third failure completes the assignment in the same transaction, so workload drops and the parcel
  shows in history; dispatch can no longer assign it (`MAX_ATTEMPTS_REACHED`).
- **Proof of delivery**: parcel must be OUT_FOR_DELIVERY (409 otherwise, nothing stored); photo
  required (422 `PROOF_REQUIRED`), ≤ `UPLOAD_MAX_BYTES` (413 `FILE_TOO_LARGE`), magic bytes must be
  JPEG/PNG/WebP (400 `UNSUPPORTED_FILE`, see `file-type.ts`). Object key `pod/<parcelId>/<uuid>.<ext>`.
  ProofOfDelivery + DELIVERED + `completeAssignment` run in one transaction; the object is deleted if
  it fails. Multer keeps a 10 MB hard ceiling; the real limit is checked in the service so the
  error code is right.
- **Photo viewing**: courier who captured it, DISPATCHER, ADMIN and the owning customer; everyone else 404. `Cache-Control: private, no-store`.
- **History**: my COMPLETED assignments (DELIVERED, or FAILED on the last attempt), paginated.
- **Web** (`/courier`, `/courier/parcels/[id]`, `/courier/history`): mobile-first cards, `tel:` and maps
  links, status buttons, a Failed dialog (`FAILURE_REASONS`) and a Deliver dialog with a camera
  input. Uploads use `fetch` with one silent-refresh retry.
- **Tests**: unit (`file-type`, `courier-actions`, `courier.service`), integration
  (`apps/api/test/courier/`, 25 cases incl. cross-courier 404s, role checks, upload validation,
  re-attempt flow, photo access matrix), web unit (`features/courier/actions.test.ts`), e2e
  (`courier-deliver.spec.ts` with `@mobile`, plus the full `delivery-journey.spec.ts`).

Known gaps: no upload progress bar (the dialog shows an "Uploading…" state); web unit tests are not
yet run in CI (`apps/web` `test` script is a placeholder).
