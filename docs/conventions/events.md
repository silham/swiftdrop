# Events & messaging

Owner: M8. Contracts: `packages/contracts/src/events.ts`. Catalog: [../contracts/event-catalog.md](../contracts/event-catalog.md).

## Producing an event (API side)

Write it to the outbox **inside the same transaction** as the change:

```ts
await this.prisma.$transaction(async (tx) => {
  // …business writes…
  await this.outbox.enqueue(tx, 'parcel.status_changed', {
    parcelId,
    trackingNumber,
    merchantId,
    customerId,
    previousStatus,
    newStatus,
    actorRole,
  });
});
```

`enqueue` builds the envelope (`eventId`, `eventVersion`, `occurredAt`, `correlationId`) and
validates it with zod. Never publish to RabbitMQ directly from the API.

## Envelope

`{ eventId (uuid), eventType, eventVersion: 1, occurredAt (ISO), correlationId, data }`.
The routing key is `<eventType>.v<version>`, for example `parcel.status_changed.v1`.

**Payload minimisation:** events contain IDs, statuses and reason codes only. They never include
names, phone numbers, emails or addresses. Consumers that need contact details load them from the DB.

## Topology

| Exchange / queue              | Type                           | Bound to                          | Notes                                                                    |
| ----------------------------- | ------------------------------ | --------------------------------- | ------------------------------------------------------------------------ |
| `swiftdrop.events`            | topic exchange                 | —                                 | all domain events                                                        |
| `notifications.parcel-events` | durable queue                  | `parcel.#`                        | DLX → `swiftdrop.dlx`                                                    |
| `webhooks.parcel-events`      | durable queue                  | `parcel.#`                        | DLX → `swiftdrop.dlx`                                                    |
| `<queue>.dlq`                 | durable queue                  | `swiftdrop.dlx` (rk = queue name) | inspect in RabbitMQ UI and `/admin/ops`                                  |
| `<queue>.retry.<delay>`       | durable queue, `x-message-ttl` | — (published to directly)         | one per delay (`10s`, `60s`, `300s`); TTL dead-letters back to `<queue>` |
| `api.sse.<uuid>`              | exclusive auto-delete queue    | `parcel.status_changed.*`         | one per API instance (M4)                                                |

## Outbox relay

The worker polls `outbox_events WHERE publishedAt IS NULL ORDER BY createdAt, id` every
`OUTBOX_POLL_INTERVAL_MS`, in a transaction with `FOR UPDATE SKIP LOCKED` (several workers can run
at once). Each row is published with its routing key and an `x-correlation-id` header, then marked
`publishedAt`. If a publish fails the row gets `attempts + 1` and `lastError`, and the batch stops
so events keep their order; the row is never dropped. Delivery is **at-least-once** (a crash between
publish and commit publishes again), which is why every consumer is idempotent.

## Retries and dead-lettering

`RabbitMqService.consume(queue, handler)` creates the queue, its `.dlq` and its retry queues, and
passes the handler `{ attempt, lastAttempt }`.

| Handler outcome                               | What happens                                                     |
| --------------------------------------------- | ---------------------------------------------------------------- |
| resolves                                      | `ack`                                                            |
| throws `TransientError`, a retry is left      | copy to `<queue>.retry.<delay>` with `x-attempt + 1`, then `ack` |
| throws `TransientError`, retries exhausted    | `nack(requeue=false)` → `<queue>.dlq`                            |
| throws anything else, or the body is not JSON | `nack(requeue=false)` → `<queue>.dlq` immediately                |

The delays come from `WEBHOOK_RETRY_DELAYS_MS` (default `10000,60000,300000`, so 3 retries) and are
shared by both work queues. The retry queue name encodes the delay, so changing the setting creates
new queues instead of clashing with existing ones.

## Consumer rules

1. Validate with `domainEvent.safeParse`. Malformed messages are dead-lettered immediately.
2. Make the consumer idempotent with `processed_events` (`isProcessed` / `markProcessed`). Return
   early on duplicates. **Write the mark only after the side effect succeeded**, otherwise a retry
   would be skipped as a duplicate. Webhooks use one key per endpoint (`webhooks:<endpointId>`) and
   notifications use the `NotificationLog` unique `(eventId, channel, recipient)` per target.
3. Retry only transient failures (network, timeouts, 408/429/5xx) with bounded backoff (for example
   10 s → 1 min → 5 min). After the last retry the message is dead-lettered and recorded as `DEAD`.
4. Don't retry permanent failures (other 4xx, validation). Record them as `FAILED`.
5. Log the `eventId` and `correlationId`, never the payload's personal data or secrets.

## Webhooks (merchant callbacks)

- `POST <endpoint.url>` with a JSON body equal to the event envelope.
- Headers:
  - `X-SwiftDrop-Event-Id`;
  - `X-SwiftDrop-Event-Type`;
  - `X-SwiftDrop-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>`.
- Timeout is `WEBHOOK_TIMEOUT_MS`. Each attempt is stored in `webhook_attempts`. Redirects are not followed.
- During secret rotation, sign with the new secret. Receivers may verify with either secret for 24 h.
- Receivers should reject timestamps more than 5 minutes from now (replay protection); see
  `verifySignature` in `apps/worker/src/consumers/webhooks/signature.ts`.
- **Signing secret storage** (agreed with M5): `webhook_endpoints.secretEncrypted` is
  `<iv>:<authTag>:<ciphertext>`, each part base64, AES-256-GCM, key = base64-decoded
  `WEBHOOK_SECRET_ENC_KEY` (32 bytes). `encryptSecret` / `decryptSecret` live in
  `apps/worker/src/consumers/webhooks/secret-crypto.ts`.

### Attempt states

| Result of one POST                      | Attempt row                   | Then                                         |
| --------------------------------------- | ----------------------------- | -------------------------------------------- |
| 2xx                                     | `SUCCEEDED`                   | endpoint marked processed                    |
| timeout, network error, 408, 429, 5xx   | `FAILED`, `nextRetryAt` set   | retry queue (`TransientError`)               |
| same, but no retry left                 | `DEAD`                        | message dead-lettered, shown in `/admin/ops` |
| any other 4xx, 3xx, bad URL, bad secret | `FAILED`, `nextRetryAt` empty | no retry, endpoint marked processed          |

An operator can re-deliver a `FAILED`/`DEAD` attempt from `/admin/ops` (`POST
/admin/ops/webhook-attempts/:id/retry`). The API publishes the original envelope (read back from
`outbox_events`) to `webhooks.parcel-events` with header `x-target-endpoint`, so only that endpoint
is called, and writes an audit entry (`webhook_attempt.retried`).

## Notifications

`parcel.created` → booking confirmation; `parcel.status_changed` → `OUT_FOR_DELIVERY`, `DELIVERED`,
`FAILED` (other statuses and `parcel.courier_assigned` send nothing). Recipients: the customer's
email, the parcel's `recipientEmail` (if different) and a mock SMS to `recipientPhone`. Provider
errors are transient. `notification_logs.recipient` stores only the masked address/number.
An event whose parcel no longer exists is skipped with a warning, not dead-lettered.

## Demo helpers (dev only)

```bash
# terminal 1: a merchant endpoint that logs and verifies signatures (secret "whsec_demo")
docker compose exec api sh -c 'cd apps/api && pnpm exec tsx ../worker/scripts/webhook-echo.ts'
# terminal 2: write a demo parcel + outbox event; the worker does the rest
docker compose exec api sh -c 'cd apps/api && pnpm exec tsx ../worker/scripts/demo-event.ts --status DELIVERED'
#   --url "http://api:4200/hook?status=503"  → failing merchant (retries, then DEAD)
#   --event created                          → parcel.created instead of a status change
```
