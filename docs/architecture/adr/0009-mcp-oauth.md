# ADR-0009: AI assistant and MCP server with our own OAuth 2.1 authorization server

**Status:** accepted · **Owner:** M1

## Context

The bonus brief asks for a generative-AI assistant that answers "Where is my parcel?" and "How much
to send 2 kg to Kandy?" by calling our APIs, ideally exposed as MCP tools. We want two things:

1. A chatbot on the public tracking page.
2. A remote MCP server that Claude and ChatGPT can connect to as the signed-in user, with the same
   permissions the user has in the web app.

## Decision

- **One tool registry, two front ends.** `modules/ai-tools` defines each tool once: name, zod input,
  roles, and a `run` that only calls another module's public service with the caller as `AuthUser`.
  Ownership checks ("is this parcel MINE?"), status rules, fees and audit entries are therefore exactly
  those of the web app. Write tools also validate against the endpoint's class-validator DTO
  (`validateDto`), so the rules exist once.
- **Role-aware tools.**
  - Public: track, estimate, service areas.
  - CUSTOMER: my parcels, book.
  - MERCHANT: my orders.
  - COURIER: my deliveries, status update. DELIVERED is not offered, because it needs a photo.
  - DISPATCHER/ADMIN: queue, workload, assign, report.
  - User management and API keys are never exposed to AI clients.
- **Chatbot (`modules/assistant`).** It works with any OpenAI-compatible chat-completions API
  (OpenAI, DeepSeek, Gemini's OpenAI endpoint), chosen by `LLM_BASE_URL`, `LLM_API_KEY` and
  `LLM_MODEL`, and uses plain `fetch`, so no vendor SDK is needed.
  - It is anonymous and only gets the **public** tools, so a prompt injection can't reach private
    data.
  - Limits: 10 requests per minute per IP, at most 12 messages of 1,000 characters each, 4 tool rounds
    and a 20-second timeout.
  - Message text is never logged. With no key set, it answers 503 `ASSISTANT_UNAVAILABLE`.
- **MCP endpoint `POST /mcp`.** It uses the official SDK (`@modelcontextprotocol/sdk`) with the
  Streamable HTTP transport in **stateless JSON mode**: a new `McpServer` for each request, registered
  with that user's tools.
  - Stateless means no sticky sessions, so it scales with the API replicas like everything else.
  - `GET` and `DELETE` answer 405.
- **SwiftDrop is its own OAuth 2.1 authorization server.** MCP clients (Claude, ChatGPT) discover it
  and register themselves, so no per-client setup is needed:
  - Discovery: `401` with `WWW-Authenticate: Bearer resource_metadata=…` → RFC 9728 protected
    resource metadata → RFC 8414 server metadata.
  - RFC 7591 dynamic client registration. Redirect URIs must be https, or http on loopback.
  - Authorization code + **PKCE S256 only**. The consent screen is the web page `/oauth/authorize`;
    users sign in with their normal account (password or Google, and `next` survives both).
  - Codes last 5 minutes, are single use (atomic `updateMany … usedAt = null`), and are bound to the
    client, redirect URI and resource. Mix-up protection: `iss` is added to the redirect (RFC 9207).
  - **Opaque tokens, stored only as SHA-256 hashes.** Access tokens last 1 hour, refresh tokens 30
    days. Refreshing rotates the pair. Replaying a rotated refresh token revokes every grant for that
    client and user. RFC 7009 revocation is supported.
  - Tokens are bound to our MCP resource (RFC 8707 `resource`). The role and `isActive` are read from
    the database on every call, so disabling a user or changing their role takes effect at once.
- The discovery documents and `/mcp` are served at the site root (excluded from the `/api/v1`
  prefix), as the RFCs and MCP clients expect. Caddy, the Ingress and Coolify route them to the API.
- `trust proxy` is set from `TRUST_PROXY_HOPS` so that per-IP rate limits see the real client behind
  the gateway.

## Alternatives considered

- **Reuse the `sd_access` JWT as the MCP token.** Rejected: it is a 15-minute browser session cookie
  with the web audience. Handing it to a third-party app would mix the two, and it can't be revoked
  per app.
- **JWT access tokens for MCP.** Rejected for now: opaque tokens need one indexed lookup, which we
  already do to check `isActive`, and they can be revoked immediately.
- **A separate MCP microservice.** Rejected for the same reasons as ADR-0001. Calling the services
  in-process reuses the authorization and audit code with no second auth layer.
- **A vendor SDK for the chatbot.** Rejected: the OpenAI wire format is shared by the three providers
  the team can use, so `fetch` keeps the provider a configuration choice.

## Consequences

- AI clients get exactly the user's permissions, with no new authorization logic to keep in sync.
- An AI app that the user approved can act until its tokens expire or are revoked. There is no "my
  connected apps" screen yet; disabling the account or revoking the token are the levers.
- Claude and ChatGPT need a public HTTPS `APP_URL` (Coolify or the Kubernetes Ingress with TLS). The
  flow can be tested locally with the MCP Inspector over `http://localhost:8080/mcp`.
- New dependency: `@modelcontextprotocol/sdk` (API only).
