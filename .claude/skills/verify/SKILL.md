---
name: verify
description: Build, run, and drive the Aster Next.js app to observe a change working end-to-end.
---

# Verifying changes in this app

Next.js 16 (App Router, Turbopack), React 19, local Postgres, `pg` driver.

## Getting a handle

A dev server is often **already running on port 3000** from the user's own
session. Check before starting one:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/sign-in
```

If it answers, drive it — Turbopack hot-reloads new routes, so files you just
created are live without a restart. `next dev` refuses to start a second
server for the same directory even on a different port ("Another next dev
server is already running"), so don't try; and don't `taskkill` the user's.

Cold start: `npx next dev -p <port>` from `ai-personal-assistant/`.
Server log: `.next/dev/logs/next-development.log` — `console.error` from route
handlers lands here as JSON, which is where caught exceptions surface when the
route only redirects to a generic `?error=` code.

**`npm run build` can kill the running dev server** — both write `.next/`. If
curl starts returning `000` mid-session, that is why; restart it and carry on
(the user loses their server either way, so prefer finishing all curl/UI checks
*before* the final build). Editing `.env.local` also triggers a `Reload env`
that has been observed to end the process.

To background one and wait for it without polling by hand:

```bash
(npx next dev -p 3000 > .next/dev-probe.log 2>&1 &)
until curl -s -o /dev/null -m 3 http://localhost:3000/sign-in; do sleep 1; done
```

## Driving

- **Route handlers** — curl them. Use `-o /dev/null -w "%{http_code} %{redirect_url}\n"`
  for OAuth-style redirect chains; `-c`/`-b` cookie jars to carry state cookies.
- **UI** — no Playwright installed, but Chrome is at
  `/c/Program Files/Google/Chrome/Application/chrome.exe`. Headless works:

  ```bash
  WD=$(cygpath -w "$PWD")
  "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new \
    --disable-gpu --window-size=900,1150 --virtual-time-budget=6000 \
    --user-data-dir="$WD\\cdata" --screenshot="$WD\\out.png" \
    http://localhost:3000/sign-in
  ```

  Pass **Windows-style paths** to `--screenshot`/`--user-data-dir` — Chrome
  fails with "Access is denied" on Git-Bash `/c/...` paths. Use `--dump-dom`
  instead of `--screenshot` to assert on hydrated text (auth forms compute
  `?error=` messages client-side behind a `typeof window` guard, so they are
  absent from the SSR HTML that curl returns).

## Screenshotting a signed-in page

Most of the app is behind auth, and `--screenshot` cannot carry a cookie. Drive
Chrome over CDP instead — **`ws` is already installed** (a Baileys dependency),
so no new package is needed.

1. Mint a session for a throwaway user with the real code path:

   ```ts
   const { createSessionTokens } = await import("../lib/server/session");
   const pair = await createSessionTokens(userId, { deviceInfo: "probe", ipAddress: null });
   // pair.accessToken goes in the `aster_access` cookie; valid 30 minutes
   ```

2. Launch `chrome.exe --headless=new --remote-debugging-port=9333
   --user-data-dir=<win path> about:blank`, poll
   `http://127.0.0.1:9333/json/list` for the `page` target, connect to its
   `webSocketDebuggerUrl`, then:

   `Network.enable` → `Page.enable` → `Network.setCookie` with
   `{name:"aster_access", value, domain:"localhost", path:"/", httpOnly:true}`
   → `Page.navigate` → wait ~4s for hydration + client fetches →
   `Page.captureScreenshot {captureBeyondViewport:true}` → write the base64 PNG.

Client components fetch `/api/auth/me` after hydration, so a fixed sleep beats
reading SSR HTML. Put PNGs in the scratchpad dir, not the repo.

To photograph a *connected* integration without real third-party credentials,
insert a grant row with a deliberately invalid refresh token and flip
`user_integrations.status` to `connected`: the page renders its connected state
and the tools card shows the real upstream failure — which is exactly how you
check that an error is actionable rather than generic.

## Exercising SQL

Scripts must live **inside the project** to resolve `node_modules` — a file in
a temp dir fails with `Cannot find module 'pg'`. Drop it in `scripts/`, run it,
delete it:

```bash
node --env-file=.env.local --import tsx scripts/_tmp-probe.ts
```

tsx compiles to CJS here, so **no top-level await** — wrap in `async function
main() {...} main()`. To validate hand-written SQL against the live schema
without persisting anything, take a client, `BEGIN`, run the statements,
`ROLLBACK` in a `finally`.

Two things that bite:

- A file with **no top-level `import`/`export` is a global script**, not a
  module, so its declarations are project-wide. Two such probes both declaring
  `main()` fail `tsc` with "Duplicate function implementation" — which bites
  precisely when you use `await import(...)` inside `main()` and nothing at the
  top. Add a top-level import (or `export {}`) and the clash disappears; the
  committed `scripts/*.ts` all declare `main()` and are fine for this reason.
- Modules read `process.env` at import time. To exercise one with config the
  environment does not have yet, set the vars *before* `await import(...)` — a
  static top-level import is hoisted and reads them too early. Note
  `--env-file` values win over exported shell vars, so an empty key in
  `.env.local` cannot be overridden from the shell.

Clean up after yourself: delete `_tmp-*` scripts and any probe rows
(`DELETE FROM public.users WHERE email='...'` cascades to tokens and
integrations).

Session tables are `user_access_tokens` / `user_refresh_tokens` (there is no
`sessions` table despite an index named that way in `db/migrations/001_init.sql`).
Per-provider OAuth state: `google_oauth_tokens` (one row per user, Gmail +
Calendar) and `microsoft_oauth_tokens` + `microsoft_access_tokens` (Outlook —
one access-token row per resource).

## Verifying an integration without third-party credentials

Most of an OAuth + MCP integration is provable offline. What each layer gives
you, cheapest first:

1. **Discovery** — `curl` the provider's
   `/.well-known/oauth-protected-resource/<path>` and assert the module derives
   the same scope and authorization server. Proves the scope is discovered, not
   guessed.
2. **Authorize URL** — build it in a probe and inspect the query: authority
   host, `redirect_uri`, `scope`, `code_challenge_method=S256`, and that the
   `state` round-trips through the module's own verifier.
3. **Negative paths through the live route** — tampered `state`, missing PKCE
   cookie, absent session, denied consent. Each should redirect to a specific
   `?int_error=` code with nothing written to the database.
4. **The real remote, unauthenticated** — a bogus code still reaches the token
   endpoint, so error *classification* is exercised for free.
5. **Pure client helpers** — payload parsers, formatters and result-view
   dispatch are ordinary functions; feed them realistic fixtures.

What is left genuinely unproven is a live token and a real tool call. Say so
plainly rather than implying the feature is verified.

`scripts/verify-outlook.ts` is a worked example of this staged approach.

## Gotchas

- `providers` on `public.users` is a `text[]` with no CHECK constraint, and
  `user_identities.provider` is plain `text` — adding an OAuth provider needs
  no migration.
- **Keep `.ps1` files pure ASCII.** Windows PowerShell 5.1 reads a script with
  no BOM as ANSI, so a UTF-8 em-dash decodes to `â€"` — and that trailing byte
  is a curly quote in cp1252, which unbalances string literals and produces
  baffling "Missing closing '}'" errors far from the real line. Check with
  `grep -nP "[^\x00-\x7F]"` and parse-check without executing:

  ```powershell
  $t=$null; $e=$null
  [System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$t,[ref]$e)
  $e   # empty means it parses
  ```
- `Set-Location` in PowerShell resets between Bash calls; prefer `cd <dir> &&`
  inside a single invocation.
