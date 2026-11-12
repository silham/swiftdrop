# Sequence diagrams

## Courier status update → tracking, notification, webhook

```mermaid
sequenceDiagram
  autonumber
  actor C as Courier
  participant API as API (courier → parcels)
  participant DB as PostgreSQL
  participant W as Worker (relay)
  participant MQ as RabbitMQ
  participant N as Notifications consumer
  participant WH as Webhooks consumer
  participant SSE as API SSE (all instances)
  actor B as Customer browser

  C->>API: PATCH /courier/parcels/:id/status {OUT_FOR_DELIVERY}
  API->>DB: active assignment = this courier?
  API->>API: canTransition(from, to)
  API->>DB: TX: update parcel · insert history · insert outbox
  API-->>C: 200 parcel
  W->>DB: SELECT unpublished outbox FOR UPDATE SKIP LOCKED
  W->>MQ: publish parcel.status_changed.v1 (confirm)
  W->>DB: set publishedAt
  par fan-out
    MQ->>N: notifications.parcel-events
    N->>DB: markProcessed / load contact
    N-->>N: send email (Mailpit) / mock SMS
  and
    MQ->>WH: webhooks.parcel-events
    WH->>WH: sign HMAC, POST merchant URL (retry/backoff → DLQ)
    WH->>DB: webhook_attempts
  and
    MQ->>SSE: api.sse.<instance>
    SSE-->>B: event: status {trackingNumber, status, occurredAt}
  end
```

## Customer booking

```mermaid
sequenceDiagram
  actor U as Customer
  participant Web as Next.js
  participant API as API (bookings → parcels → pricing)
  participant DB as PostgreSQL
  U->>Web: fill booking form
  Web->>API: POST /pricing/estimate
  API-->>Web: { feeCents, currency }
  U->>Web: confirm
  Web->>API: POST /parcels (cookie sd_access)
  API->>API: PricingService.estimate (server-side fee)
  API->>DB: TX: parcel CREATED · history · outbox parcel.created
  API-->>Web: { trackingNumber, … }
```

## Merchant API order

```mermaid
sequenceDiagram
  participant M as Merchant system
  participant API as API (ApiKeyGuard → merchant-api → parcels)
  participant DB as PostgreSQL
  M->>API: POST /merchant/parcels (X-Api-Key, merchantReference)
  API->>DB: find key by prefix, compare sha256, merchant APPROVED?
  API->>DB: existing (merchantId, merchantReference)? → return it (idempotent)
  API->>DB: TX: parcel · history · outbox parcel.created
  API-->>M: 201 { trackingNumber, status }
```

## Courier assignment

```mermaid
sequenceDiagram
  autonumber
  actor D as Dispatcher
  participant API as API (dispatch)
  participant DB as PostgreSQL
  participant W as Worker (relay)
  participant MQ as RabbitMQ
  D->>API: POST /dispatch/assignments {parcelId, courierId}
  API->>DB: TX start
  API->>DB: SELECT parcel … FOR UPDATE, then courier_profile … FOR UPDATE (fixed order, no deadlock)
  API->>DB: parcel CREATED or FAILED (with attempts left)? no ACTIVE assignment?
  API->>DB: courier active, available, active parcels < maxActiveParcels?
  API->>DB: insert courier_assignment (ACTIVE) · audit parcel.assigned · outbox parcel.courier_assigned
  API->>DB: TX commit
  API-->>D: 201 assignment
  W->>DB: SELECT unpublished outbox … SKIP LOCKED
  W->>MQ: publish parcel.courier_assigned.v1
  Note over D,API: Cancel: DELETE /dispatch/assignments/:id (CREATED, PICKED_UP or FAILED parcels) sets it CANCELLED and audits parcel.unassigned
```

## Delivery with proof, failure and re-attempt

```mermaid
sequenceDiagram
  autonumber
  actor C as Courier
  participant API as API (courier → parcels, dispatch)
  participant S3 as Object storage
  participant DB as PostgreSQL
  C->>API: PATCH /courier/parcels/:id/status {FAILED, reason}
  API->>DB: TX: transition FAILED · history · outbox (assignment stays ACTIVE)
  API-->>C: 200 (next: re-attempt)
  C->>API: PATCH …/status {OUT_FOR_DELIVERY} (attempt count + 1, max 3)
  C->>API: POST /courier/parcels/:id/proof (photo, recipientName)
  API->>API: size, magic bytes (JPEG/PNG/WebP), parcel is OUT_FOR_DELIVERY
  API->>S3: put pod/<parcelId>/<uuid>.<ext>
  API->>DB: TX: proof_of_delivery · transition DELIVERED · history · outbox · assignment COMPLETED
  alt the transaction fails
    API->>S3: remove the stored photo
  end
  API-->>C: 200 delivered
  Note over C,DB: Third failed attempt: the same TX also completes the assignment, so the parcel is no longer assignable
```

## Webhook retry and dead letter queue

```mermaid
sequenceDiagram
  autonumber
  participant MQ as RabbitMQ
  participant WH as Webhooks consumer
  participant M as Merchant endpoint
  participant DB as PostgreSQL
  MQ->>WH: webhooks.parcel-events (x-attempt: 1)
  WH->>DB: endpoints of this merchant subscribed to the event
  WH->>M: POST signed body (t=<ts>,v1=<hmac>), timeout
  WH->>DB: webhook_attempts row (status, response code, duration)
  alt 2xx
    WH->>MQ: ack (SUCCEEDED)
  else 4xx (except 408/429)
    WH->>MQ: ack (FAILED, no retry: the merchant must fix their endpoint)
  else timeout, 5xx, 408, 429
    WH->>MQ: publish to retry queue (delay 10 s, then 1 min, then 5 min; x-attempt + 1)
    MQ-->>WH: message returns after the delay (dead-letters back)
    Note over WH,M: after the last retry
    WH->>MQ: publish to webhooks.parcel-events.dlq
    WH->>DB: attempt marked DEAD
  end
  Note over DB: An admin can re-send a DEAD or FAILED attempt: POST /admin/ops/webhook-attempts/:id/retry (audited)
```

## Login with Google (OAuth 2.0 authorization code + PKCE)

Code: `apps/api/src/modules/auth/auth.controller.ts` (`google`, `googleCallback`) and
`auth.service.ts` (`googleAuthUrl`, `googleCallback`). The browser never sees a Google token; the API
swaps the code server-side and then issues SwiftDrop's own session cookies.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser
  participant API as API (auth module)
  participant G as Google OAuth 2.0
  participant DB as PostgreSQL

  U->>B: click "Continue with Google"
  B->>API: GET /api/v1/auth/google?next=/optional/path
  API->>API: state = random 32 bytes · PKCE verifier + S256 challenge
  API-->>B: 302 to Google + Set-Cookie sd_oauth_state, sd_oauth_verifier, sd_oauth_next (httpOnly, 10 min)
  B->>G: authorize?client_id&redirect_uri&scope=openid email profile&state&code_challenge
  U->>G: sign in and consent
  G-->>B: 302 /api/v1/auth/google/callback?code&state
  B->>API: GET callback (cookies sent back, SameSite=Lax)
  API->>API: state == cookie state? (timing-safe) else 401
  API->>G: POST token endpoint {code, code_verifier, client secret}
  G-->>API: id_token (+ access token, not stored)
  API->>G: verifyIdToken(audience = GOOGLE_CLIENT_ID) · signature, iss, exp
  API->>API: require email and email_verified
  API->>DB: find OAuthAccount (provider=google, sub)
  alt already linked
    DB-->>API: user
  else verified email matches an existing user
    API->>DB: insert OAuthAccount (link)
  else new person
    API->>DB: TX: insert User (role CUSTOMER, no password) + OAuthAccount
  end
  API->>API: user.isActive? else 403 ACCOUNT_DISABLED
  API->>DB: insert RefreshSession (SHA-256 hash of refresh token, user agent, IP)
  API-->>B: 302 to next (same-site only) or role home · Set-Cookie sd_access (JWT, 15 min), sd_refresh (path /api/v1/auth) · clear sd_oauth_*
```

## AI client connects over MCP (OAuth 2.1 + dynamic client registration)

How Claude or ChatGPT gets a token for `/mcp`. SwiftDrop is its own authorization server; the user
signs in with their normal SwiftDrop account (password or Google) and approves the client. Details
in [ADR-0009](../architecture/adr/0009-mcp-oauth.md).

```mermaid
sequenceDiagram
  autonumber
  participant AI as AI client (Claude / ChatGPT)
  participant MCP as API /mcp
  participant AS as API OAuth server
  actor U as User (browser)
  participant WEB as Web /oauth/authorize
  participant DB as PostgreSQL

  AI->>MCP: POST /mcp (no token)
  MCP-->>AI: 401 WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp"
  AI->>AS: GET /.well-known/oauth-protected-resource/mcp → /.well-known/oauth-authorization-server
  AI->>AS: POST /api/v1/oauth/register {client_name, redirect_uris}
  AS->>DB: insert McpClient
  AS-->>AI: client_id
  AI->>U: open /oauth/authorize?client_id&redirect_uri&state&code_challenge(S256)&resource
  U->>WEB: sign in if needed (password or Google, next= keeps the request)
  WEB->>AS: GET /oauth/authorize/check → client name + tools for this role
  U->>WEB: Allow
  WEB->>AS: POST /api/v1/oauth/authorize (session cookie)
  AS->>DB: insert McpAuthorizationCode (hash, 5 min, single use)
  AS-->>U: redirect_uri?code&state
  U-->>AI: code reaches the client's callback
  AI->>AS: POST /api/v1/oauth/token {code, code_verifier, redirect_uri}
  AS->>AS: SHA256(verifier) == challenge · code unused · same client, redirect, resource
  AS->>DB: mark code used · insert McpGrant (hashed access 1 h + refresh 30 d)
  AS-->>AI: access_token, refresh_token
  AI->>MCP: POST /mcp tools/call (Bearer access_token)
  MCP->>DB: grant valid? user active? role from DB
  MCP->>MCP: tools for that role only · service-level ownership checks
  MCP-->>AI: tool result
```
