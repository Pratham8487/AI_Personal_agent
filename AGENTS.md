<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Aster — architecture notes

Multi-user AI assistant (Next.js 16 + React 19 + local Postgres via `pg`).
Per-user OAuth grants, tokens only ever server-side, provider actions exposed as
MCP tools. To verify a change end-to-end, use the `verify` skill.

## Integrations: four providers, one contract

Every provider's executor has the same signature — `(userId, toolName, args) =>
{ text, structured }` — so the agent bridge, the MCP proxy routes and the
dashboard treat them identically. What differs is only where the catalog and the
execution come from:

| Provider | Tool catalog | Execution |
|---|---|---|
| Gmail | hardcoded (`gmail-api.ts`) | in-app Gmail REST |
| Google Calendar | live from Google's official MCP server | MCP-first, REST fallback (`google-calendar-rest.ts`) for preview-ineligible accounts |
| Outlook | live union of Microsoft's **three** official Work IQ MCP servers | MCP only — **no Graph REST wrappers, deliberately** |
| WhatsApp | hardcoded (`whatsapp-mcp.ts`) | Baileys socket |

Shared plumbing — reuse these rather than writing a fourth copy:

- `lib/server/mcp-http.ts` — streamable-HTTP JSON-RPC transport (JSON *and* SSE
  replies), plus the `initialize` / `Mcp-Session-Id` handshake.
- `lib/server/mcp-proxy.ts` — `createMcpProxy(config)` builds a whole
  `/api/integrations/<id>/mcp` route: envelope, batching, notifications, 405 GET,
  error mapping. Both remote providers use it.
- `lib/mcp-types.ts` — browser-side MCP types + `fetchMcpTools` / `runMcpTool`.
- `components/dashboard/mcp-tool-runner.tsx` — renders **any** tool as a form
  generated from its `inputSchema`. Nothing tool-specific belongs in it.

## Adding a provider

1. `lib/integrations.ts` — `PROVIDERS` entry; `hasLiveTools: true` swaps the
   card's "Coming Soon" for Connect + Settings.
2. OAuth module in `lib/server/` — copy whichever is closer:
   `google-oauth.ts` (one grant, incremental via `include_granted_scopes`) or
   `microsoft-oauth.ts` (one grant, but a token *per resource*, PKCE, discovery).
3. `lib/server/<id>-mcp.ts` returning `{ text, structured }`.
4. Routes `auth` / `callback` / `disconnect` / `mcp` under
   `app/api/integrations/<id>/`; the `mcp` one is `createMcpProxy(...)`.
5. `lib/use-integrations.ts` — add to `OAUTH_PROVIDERS` and `MANAGED_DISCONNECT`.
6. `app/api/integrations/status/route.ts` — add to the managed-provider guard so
   the status cannot be toggled directly.
7. `lib/server/agent/tools.ts` — one `LIVE_PROVIDERS` entry. Names are
   namespaced `<provider>_<tool>`; keep them under OpenAI's 64-char cap.
8. Optional: `lib/server/dashboard/providers/<id>.ts` + `registry.ts` to feed the
   daily brief. **Outlook is not registered there yet** — connecting it does not
   affect the dashboard.

## Invariants

- **Never hardcode a remote MCP server's catalog.** Fetch `tools/list` at
  runtime and cache it (per tenant for Outlook, since its URLs and scopes embed
  the tenant GUID). Serve a stale catalog rather than an empty list.
- The user id always comes from the **session cookie** (`getSessionUser`), never
  from a query param or request body.
- OAuth-flow failures **redirect** to `/integrations?int_error=<code>&provider=<id>`
  (the browser is mid-redirect); API failures return JSON.
- Errors a user can act on get their own class and reach the UI intact; anything
  else is logged and replaced with a generic message. See
  `MicrosoftNotEligibleError`, whose `reason` maps to copy in
  `app/(dashboard)/integrations/page.tsx`.

## OAuth grants

- `google_oauth_tokens` — one row per user, shared by Gmail + Calendar. Revoked
  only when the *last* Google integration disconnects.
- `microsoft_oauth_tokens` + `microsoft_access_tokens` — Entra issues one access
  token per resource and rotates the refresh token on **every** redemption, so
  the rotated value must always be persisted. Entra has no revoke endpoint.
- Outlook requires a Microsoft 365 **work/school** account with a Copilot
  licence and tenant admin consent; personal accounts are rejected by Entra
  itself. There is no fallback by design — see the README.
