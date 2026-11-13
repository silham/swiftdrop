# Hosting on Coolify (HTTPS, for the demo and for Claude / ChatGPT)

Claude.ai and ChatGPT only connect to MCP servers on a public **HTTPS** URL. The simplest way to get one
is to deploy `compose.prod.yaml` on a Coolify server; Coolify's proxy (Traefik) provides the TLS
certificate. Owner: M10.

## 1. Create the resource

1. In Coolify: **+ New → Resource → Public/Private Repository**. Pick this repository and branch
   `main`.
2. Build pack: **Docker Compose**. Compose file: `compose.prod.yaml`.
3. Under **Domains**, give the `gateway` service your domain on port 80, e.g.
   `https://swiftdrop.example.com:80`. The other services stay internal.
4. The local port mapping (`GATEWAY_PORT`, default 8080) isn't needed behind Coolify's proxy. Set
   `GATEWAY_PORT` to a free port if 8080 is taken on the server.

## 2. Environment variables

Coolify lists every `${VAR}` used in `compose.prod.yaml`. Set at least:

| Variable                                                       | Value                                                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                                      | `https://swiftdrop.example.com` (OAuth issuer, MCP URL, links in emails)                                        |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                      | `openssl rand -hex 32`, two different values                                                                    |
| `WEBHOOK_SECRET_ENC_KEY`                                       | `openssl rand -base64 32` (don't change it later: stored webhook secrets are encrypted with it)                 |
| `POSTGRES_PASSWORD`, `RABBITMQ_PASSWORD`, `STORAGE_SECRET_KEY` | fresh random values, set **before the first deploy** (the database keeps its first password)                    |
| `TRUST_PROXY_HOPS`                                             | `2` (Coolify's Traefik + the Caddy gateway)                                                                     |
| `RUN_SEED`                                                     | `true` for a demo server: loads the test accounts and demo parcels (safe to repeat)                             |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                     | from Google Cloud Console. Authorised redirect URI: `https://swiftdrop.example.com/api/v1/auth/google/callback` |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`                     | the chatbot's model, e.g. `https://api.deepseek.com` + key + `deepseek-chat` (presets in `.env.example`)        |

`COOKIE_SECURE` defaults to `true` here, which is right for HTTPS. Dev login is always off in this
file.

## 3. Deploy and check

Press **Deploy**, then check:

```bash
curl https://swiftdrop.example.com/api/v1/health                              # db, rabbitmq, storage: true
curl https://swiftdrop.example.com/.well-known/oauth-authorization-server      # issuer = your https URL
curl -i -X POST https://swiftdrop.example.com/mcp                             # 401 + WWW-Authenticate
```

Mailpit (captured emails) isn't public. Open it from the server with
`docker exec` / port-forward, or point `SMTP_HOST` / `SMTP_PORT` at a real SMTP relay.

## Connect Claude and ChatGPT

**Claude** (claude.ai, Pro/Max/Team/Enterprise, or Claude Desktop):

1. **Settings → Connectors → Add custom connector**.
2. Name `SwiftDrop`, URL `https://swiftdrop.example.com/mcp`. Leave the OAuth client fields empty;
   Claude registers itself.
3. Click **Connect**. You'll land on SwiftDrop's sign-in page, then on "Allow Claude to use
   SwiftDrop?". Choose **Allow**.
4. In a chat, enable the connector and ask, for example: "Where is SD100000002?", "How much to send
   2 kg from Colombo to Kandy?", "List my parcels", or (as a dispatcher) "Who has the lightest
   workload? Assign SD… to them."

**ChatGPT** (plans with developer mode / custom connectors):

1. **Settings → Apps & Connectors → Advanced → Developer mode** on.
2. **Create**: name `SwiftDrop`, MCP server URL `https://swiftdrop.example.com/mcp`, authentication
   **OAuth**.
3. Sign in and allow, as above.

What the AI can do depends on the account you sign in with (customer, merchant, courier, dispatcher
or admin). Everything is checked like the user's own clicks and audited under their name. See
[ADR-0009](../architecture/adr/0009-mcp-oauth.md).

## Testing without a public URL

The MCP Inspector works over plain HTTP on localhost:

```bash
docker run --rm -p 6274:6274 -p 6277:6277 ghcr.io/modelcontextprotocol/inspector:latest
```

Open http://localhost:6274 and choose transport **Streamable HTTP** with URL
`http://host.docker.internal:8080/mcp`. Then pick **Open Auth Settings → Quick OAuth Flow** and sign
in as a demo user.
