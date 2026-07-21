# Deploying Aster to Vercel + Neon (free)

The serverless path: no WhatsApp, no card, no VM. For the always-on path that
keeps WhatsApp, see [README.md](./README.md) — both can coexist, and the code
supports either without a branch.

```
prathamshah.me        -> Hostinger shared hosting (static portfolio, unchanged)
aster.prathamshah.me  -> CNAME -> Vercel (Next.js, auto-deploy from `main`)
                                    -> Neon Postgres (TLS, pooled)
Trigger.dev cloud     -> POSTs /api/briefings/{claim-due,run} every 15 min
```

## What works and what doesn't

| Feature | Serverless | Why |
|---|---|---|
| Email/password auth, Google + GitHub sign-in | ✅ | Plain HTTP |
| Gmail, Google Calendar, Outlook | ✅ | REST/MCP over HTTPS, no socket |
| Agent chat (NDJSON streaming) | ✅ | Vercel streams; 300s function cap |
| Briefings via Trigger.dev | ✅ | Cron lives off-platform |
| **WhatsApp** | ❌ | Baileys needs a long-lived socket in `globalThis` |

WhatsApp is already dormant — `hasLiveTools: false` in `lib/integrations.ts`
makes its card read "Coming Soon", and `lib/server/agent/tools.ts` only exposes
tools for *connected* providers. No code needs deleting.

## Step 1 — Neon Postgres (you)

1. https://neon.tech → sign up with GitHub → create a project.
2. Region: pick the one nearest your Vercel region (see step 2 note).
3. From the dashboard copy **two** connection strings:
   - **Pooled** (host contains `-pooler`) → for the app.
   - **Direct** (no `-pooler`) → for running migrations.

`lib/server/db.ts` uses `DATABASE_URL` when present and falls back to the
discrete `POSTGRES_*` vars otherwise, so nothing else changes.

## Step 2 — Run migrations against Neon (local machine)

`scripts/db-migrate.ts` skips its `CREATE DATABASE` step when a connection
string is set — Neon provisions the database for you and forbids that call.

PowerShell:

```powershell
$env:DATABASE_URL = "postgres://...  (DIRECT string)"
npm run db:migrate
Remove-Item Env:\DATABASE_URL
```

Bash:

```bash
DATABASE_URL="postgres://... (DIRECT)" npm run db:migrate
```

`process.env` wins over `.env.local`, so this does not disturb local dev. The
script is idempotent — re-running it is safe.

## Step 3 — Vercel project (you)

1. https://vercel.com → sign up **with GitHub** (no card needed).
2. **Add New → Project** → import `Pratham8487/AI_Personal_agent`.
3. Root directory: **`ai-personal-assistant`** (the repo root is one level up —
   getting this wrong is the most common first-deploy failure).
4. Framework preset: Next.js. Leave build/output settings alone.
5. Set **Production Branch = `main`** under Settings → Git.
6. Region: Settings → Functions → **Singapore (`sin1`)**, matching Neon.
   Hobby allows one region but places no restriction on *which* one.

   This must equal the Neon region. A single page load issues many queries, so
   a cross-region app↔DB hop multiplies: co-located is ~1-5ms per query,
   Singapore↔US-East is ~250ms *each*. Do not pick Mumbai (`bom1`) — Neon has
   no India region, so `bom1` would strand the database an ocean away.

Don't deploy yet — add env vars first, or the first build ships without them.

## Step 4 — Environment variables (Vercel → Settings → Environment Variables)

Set every one for **Production** (and Preview, if you want PR previews to work).
`NODE_ENV=production` is set by Vercel automatically — do not add it.

**Required**

| Var | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string |
| `PHONE_AUTH_SECRET` | `openssl rand -base64 48` — fresh, not the dev value |
| `OPENAI_API_KEY` | your key |
| `OPENAI_MODEL` | e.g. `gpt-4o-mini` |
| `INTERNAL_API_SECRET` | `openssl rand -hex 32` — same value goes in Trigger.dev |
| `GMAIL_SMTP_USER` | mailer account |
| `GMAIL_SMTP_APP_PASSWORD` | Gmail App Password (needs 2FA) |

**OAuth** — omit a pair to disable that provider.

| Var | Notes |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail + Calendar client (restricted scopes) |
| `GOOGLE_SIGNIN_CLIENT_ID` / `GOOGLE_SIGNIN_CLIENT_SECRET` | Separate sign-in-only client. If blank, sign-in falls back to the pair above and inherits its 100-user cap |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub sign-in |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Outlook. Needs an M365 **work/school** account with a Copilot licence and tenant admin consent — personal accounts are rejected by Entra itself |

**Optional**

| Var | Default |
|---|---|
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `POSTGRES_POOL_MAX` | `3` when `DATABASE_URL` is set |
| `POSTGRES_SSL_NO_VERIFY` | unset. Only for providers with self-signed certs — Neon does not need it |

Note `POSTGRES_HOST`/`PORT`/`DB`/`USER`/`PASSWORD` are **not** used once
`DATABASE_URL` is set.

## Step 5 — Deploy and smoke test

Deploy. Then on the `*.vercel.app` URL:

```bash
# 503 = INTERNAL_API_SECRET missing; 401 = set correctly (expected)
curl -X POST https://<project>.vercel.app/api/briefings/claim-due \
  -H 'x-internal-secret: wrong' -i
```

Sign-up with email/password should work before any OAuth is wired.

## Step 6 — Custom domain

1. Vercel → Settings → Domains → add `aster.prathamshah.me`. Vercel shows the
   CNAME target (usually `cname.vercel-dns.com`).
2. Hostinger → Domains → prathamshah.me → **DNS Zone** → add:

| Type | Name | Points to | TTL |
|---|---|---|---|
| CNAME | `aster` | `cname.vercel-dns.com` | 300 |

Leave the root `prathamshah.me` records alone — the portfolio keeps working.
TLS is issued by Vercel automatically once the record resolves. Verify with
`nslookup aster.prathamshah.me`.

## Step 7 — OAuth redirect URIs

Redirect URIs are derived from the request origin, so they must match the final
domain exactly. Add these **after** the domain is live, and keep the localhost
entries alongside so local dev still works.

**Google Cloud Console** → Credentials:

- Gmail/Calendar client → `https://aster.prathamshah.me/api/integrations/gmail/callback`
- Sign-in client → `https://aster.prathamshah.me/api/auth/google/callback`

(If you use one client for both, add both URIs to it.)

**Google consent screen → set publishing status to "In production".**
Do **not** leave it in Testing: Google revokes refresh tokens after 7 days in
Testing mode, which would break the cron briefings every week. Production
without verification keeps tokens permanent, stays free, and caps at 100 users.
Users see a "Google hasn't verified this app" interstitial and click
*Advanced → Go to app* — expected, not a bug.

**GitHub** → OAuth Apps → callback URL:
`https://aster.prathamshah.me/api/auth/github/callback`

**Microsoft Entra** (only if using Outlook) → app registration → Redirect URIs.

## Step 8 — Trigger.dev

From your local machine:

```bash
npm run trigger:deploy
```

Then in the Trigger.dev dashboard → Environment Variables (Production):

| Var | Value |
|---|---|
| `APP_BASE_URL` | `https://aster.prathamshah.me` |
| `INTERNAL_API_SECRET` | exactly the value set in Vercel |

`APP_BASE_URL` is read only by `trigger/*.ts`, which run on Trigger.dev's
cloud — that is why it is not a Vercel env var.

## CI/CD

Vercel's Git integration *is* the pipeline; no GitHub Actions workflow is
required.

| Event | Result |
|---|---|
| Push to `main` | Production build → `aster.prathamshah.me` |
| Push to any other branch | Isolated preview URL, production untouched |
| Open a PR | Vercel comments the preview link on the PR |

Rollback: Vercel → Deployments → pick a previous one → **Promote to
Production**. Instant, no rebuild.

Migrations are **not** automatic — run step 2 manually before deploying a
release that adds a file to `db/migrations/`.

If you want a merge gate, add a workflow running `npm ci && npm run lint &&
npm run build` on pull requests and mark it a required check. Vercel already
builds every push, so this is only worth it to block merges on failure.

## Troubleshooting

**Build fails immediately.** Root directory is probably wrong — it must be
`ai-personal-assistant`, not the repo root.

**`self-signed certificate` / connection refused from Postgres.** The pooled
Neon string is required, and `DATABASE_URL` must actually be set in the
Production environment (not only Preview).

**`redirect_uri_mismatch`.** The URI in Google/GitHub must match the deployed
origin character-for-character, including `https://` and no trailing slash.

**Logged out on refresh.** Session cookies need `Secure`, which keys off
`NODE_ENV=production`. Vercel sets this — if you overrode it, remove the
override.

**Gmail disconnects every ~7 days.** The consent screen is still in Testing
mode. See step 7.

**Agent chat truncates around 5 minutes.** Hobby caps functions at 300s. Shorten
the tool loop or move to the VM runbook.

**Too many connections.** Lower `POSTGRES_POOL_MAX`, and confirm you used the
pooled Neon host.
