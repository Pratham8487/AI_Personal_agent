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

Session tables are `user_access_tokens` / `user_refresh_tokens` (there is no
`sessions` table despite an index named that way in `db/migrations/001_init.sql`).

## Gotchas

- `providers` on `public.users` is a `text[]` with no CHECK constraint, and
  `user_identities.provider` is plain `text` — adding an OAuth provider needs
  no migration.
- `Set-Location` in PowerShell resets between Bash calls; prefer `cd <dir> &&`
  inside a single invocation.
