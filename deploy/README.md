# Deploying Aster

Target: `https://aster.prathamshah.me` on an Oracle Cloud Always Free VM, ₹0/month.

```
prathamshah.me        -> Hostinger shared hosting (static portfolio)
aster.prathamshah.me  -> Oracle Always Free VM
                           Caddy :443  (auto-HTTPS)
                             -> Next.js :3000  (PM2, fork mode, 1 instance)
                             -> PostgreSQL :5432  (127.0.0.1 only)
Trigger.dev cloud     -> POSTs /api/briefings/{claim-due,run} every 15 min
                         with the x-internal-secret header
```

## Why a VM and not a PaaS

Three properties of this codebase rule out the usual free options:

1. **WhatsApp needs a long-lived process.** Baileys sockets live in `globalThis`
   (`lib/server/whatsapp-manager.ts`). Anything that sleeps on idle, scales to
   zero, or runs more than one instance breaks pairing. That eliminates Vercel,
   Cloud Run, and Render's free web services.
2. **Postgres must be local.** `lib/server/db.ts` has no SSL and no
   `DATABASE_URL` support, so a managed TLS-only host (Neon, Supabase) fails
   without a code change.
3. **The agent calls Gmail/WhatsApp tools in-process**
   (`lib/server/agent/tools.ts`), so the app can't be split across a serverless
   frontend and a socket host.

Free-tier alternatives as of July 2026: Koyeb closed its free tier to new users
after the Mistral acquisition; Railway and Fly.io moved to trial/usage billing;
Render free services sleep and its free Postgres expires. Oracle Always Free is
the remaining option that's genuinely free and always-on.

**One caveat:** Oracle [halved the Always Free ARM allowance on 15 June 2026](https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/),
from 4 OCPU/24 GB to 2 OCPU/12 GB, with no announcement. 2 OCPU/12 GB is still
comfortable for this app. Signup is the risky part — new accounts are often
flagged or held in review, and ARM capacity in Indian regions runs out. If you
get stuck there, see [Fallbacks](#fallbacks).

---

## Step 1 — Create the Oracle account (you)

1. https://signup.cloud.oracle.com — pick **India South (Hyderabad)** or
   **India West (Mumbai)** as the home region. **This cannot be changed later.**
2. A card is required for identity verification; Always Free resources are not
   charged. Leave the account on the Free tier — do not "Upgrade to Paid".
3. Wait for the provisioning email (minutes, occasionally days).

## Step 2 — Create the VM (you)

**Compute → Instances → Create instance**

| Field | Value |
|---|---|
| Image | Canonical Ubuntu 24.04 |
| Shape | `VM.Standard.A1.Flex` (Ampere, arm64) |
| OCPUs / Memory | 2 / 12 GB |
| Boot volume | 50 GB |
| SSH keys | Upload your public key, or let Oracle generate and **download the private key** |

If you hit **"Out of host capacity"**, that region has no free ARM left. Retry
later, or switch shape to `VM.Standard.E2.1.Micro` (AMD, 1 OCPU/1 GB — the swap
in `setup-vm.sh` matters a lot there).

Note the **public IP** once it's running.

## Step 3 — Open ports 80/443 (you)

Two separate firewalls, and both must be opened — missing the second is the
most common "site won't load" cause on OCI.

**a) Security List:** Instance → Subnet → Default Security List → Add Ingress Rules

| Source CIDR | Protocol | Dest. port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

**b) The VM's own iptables** — handled by `setup-vm.sh` in step 5.

## Step 4 — Point DNS at the VM (you)

In **Hostinger → Domains → prathamshah.me → DNS Zone**:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `aster` | *your VM's public IP* | 300 |

Do this now — Caddy can't issue a certificate until the record resolves.
Check with `nslookup aster.prathamshah.me`.

## Step 5 — Provision the VM

```bash
ssh -i /path/to/private_key ubuntu@<VM_PUBLIC_IP>

git clone https://github.com/Pratham8487/AI_Personal_agent.git aster
cd aster
chmod +x deploy/setup-vm.sh
./deploy/setup-vm.sh
```

Installs Node 24, PostgreSQL, PM2, Caddy; adds 4 GB swap; opens 80/443 in
iptables; creates the `aster` Postgres role. **Copy the generated
`POSTGRES_PASSWORD`** — also saved to `~/.aster-db-password`.

If the repo is private, generate a token at
https://github.com/settings/tokens and clone with
`https://<TOKEN>@github.com/...`.

## Step 6 — Write the production env

```bash
cd ~/aster
cp deploy/env.production.example .env.local
nano .env.local
chmod 600 .env.local
```

Fill in every blank. Generate fresh secrets — do not copy the dev values:

```bash
openssl rand -base64 48   # PHONE_AUTH_SECRET
openssl rand -hex 32      # INTERNAL_API_SECRET  (also goes in Trigger.dev)
```

## Step 7 — Install, migrate, build

```bash
cd ~/aster
npm ci                # installs arm64 binaries; do NOT copy node_modules from Windows
npm run db:migrate    # creates the DB + applies db/migrations/*.sql
npm run build
```

`db:migrate` is idempotent and transactional per migration, so re-running it is
safe. The build takes a few minutes on Ampere.

## Step 8 — Start under PM2

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu   # run the command it prints
pm2 logs aster --lines 50
```

Smoke test locally before involving TLS:

```bash
curl -I http://127.0.0.1:3000
```

## Step 9 — Put Caddy in front

```bash
sudo cp ~/aster/deploy/Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl status caddy
```

Certificate issuance takes ~30s on first start. Then from your laptop:

```bash
curl -I https://aster.prathamshah.me
```

## Step 10 — OAuth redirect URIs (you)

The route handlers derive redirect URIs from the request origin, so these must
match the public hostname exactly.

**Google Cloud Console** → APIs & Services → Credentials → your OAuth client →
Authorized redirect URIs. Add **both** (one client serves sign-in and Gmail):

```
https://aster.prathamshah.me/api/auth/google/callback
https://aster.prathamshah.me/api/integrations/gmail/callback
```

Also add `https://aster.prathamshah.me` to Authorized JavaScript origins. If the
OAuth consent screen is still in Testing, add your Google account under Test
users.

**GitHub** → Settings → Developer settings → OAuth Apps → your app:

- Homepage URL: `https://aster.prathamshah.me`
- Authorization callback URL: `https://aster.prathamshah.me/api/auth/github/callback`

Keep the localhost URIs alongside these so local dev keeps working.

## Step 11 — Trigger.dev

From your **local machine** (not the VM):

```bash
npm run trigger:deploy
```

Then in the Trigger.dev dashboard → your project → **Environment Variables**,
set for Production:

| Var | Value |
|---|---|
| `APP_BASE_URL` | `https://aster.prathamshah.me` |
| `INTERNAL_API_SECRET` | the exact value from `.env.local` |

`APP_BASE_URL` is read only by `trigger/*.ts`, which run on Trigger.dev's cloud
— that's why it isn't in the VM's env file.

Verify the secret is wired correctly:

```bash
# 503 = INTERNAL_API_SECRET missing on the app side
# 401 = set, but this request's secret is wrong  <- expected here
curl -X POST https://aster.prathamshah.me/api/briefings/claim-due \
  -H 'x-internal-secret: wrong' -i
```

## Step 12 — Verify end to end

- [ ] Sign up with email/password; confirm the verification mail arrives
- [ ] Google sign-in
- [ ] GitHub sign-in
- [ ] Gmail connect → labels and emails load
- [ ] WhatsApp pairing code → linked; survives `pm2 restart aster`
      (creds live in the `whatsapp_auth_state` table, not on disk)
- [ ] Agent chat streams token-by-token — if it arrives in one lump, Caddy's
      `flush_interval -1` isn't applied
- [ ] Schedule a briefing, confirm it fires within ~15 min
- [ ] Update the portfolio's "Live demo — coming soon" button to the real URL

---

## Redeploying after a code change

```bash
cd ~/aster
git pull
npm ci
npm run db:migrate    # no-op when there are no new migrations
npm run build
pm2 restart aster
```

WhatsApp sockets drop on restart and reconnect from the Postgres-stored creds.

## Backups

Everything stateful is in Postgres — no volumes to snapshot.

```bash
pg_dump -U aster -h 127.0.0.1 Personal_assistant_db | gzip > ~/aster-$(date +%F).sql.gz
```

## Troubleshooting

**Site unreachable.** Check both firewalls: the OCI Security List *and*
`sudo iptables -L INPUT -n --line-numbers`.

**Caddy won't issue a certificate.** DNS must resolve to the VM before Caddy
starts, and port 80 must be open for the ACME challenge. Watch
`sudo journalctl -u caddy -f`.

**`redirect_uri_mismatch` on sign-in.** The upstream is seeing the wrong host.
Confirm you didn't add a `header_up Host` override to the Caddyfile — the app
builds redirect URIs from the request origin, so Host must stay as the public
hostname.

**Sessions don't persist / logged out on refresh.** `NODE_ENV` isn't
`production`, so the session cookie lost its `Secure` flag. Check
`pm2 env 0 | grep NODE_ENV`.

**Briefings never run.** `INTERNAL_API_SECRET` must match on both sides, and
`APP_BASE_URL` in Trigger.dev must be the https URL. A 503 from `claim-due`
means the app has no secret set.

**Build OOM-killed.** Confirm swap is active with `swapon --show`.

## Fallbacks

If Oracle rejects the account or has no ARM capacity:

- **Google Cloud Always Free `e2-micro`** — `us-central1`/`us-west1`/`us-east1`,
  1 vCPU/1 GB, 30 GB disk, free indefinitely. Same runbook; swap is essential
  and the build is slow. Higher latency from India.
- **Any ₹300-500/mo VPS** (Hetzner CX22, DigitalOcean, Contabo) — same runbook,
  no capacity roulette.

Hostinger Premium **cannot** host this app — shared hosting runs no Node
processes. It stays the static portfolio host only.
