#!/usr/bin/env bash
# Aster — one-time VM provisioning for Ubuntu 24.04 (Oracle Cloud Ampere A1 / arm64).
# Installs Node 24, PostgreSQL, PM2, Caddy. Idempotent: safe to re-run.
#
#   chmod +x setup-vm.sh && ./setup-vm.sh
#
# Does NOT clone the repo or write .env.local — see deploy/README.md steps 6-8.

set -euo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [[ $EUID -eq 0 ]]; then
  echo "Run as the 'ubuntu' user, not root (the script sudo's where needed)." >&2
  exit 1
fi

log "System packages"
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y curl git build-essential ca-certificates gnupg debian-keyring \
  debian-archive-keyring apt-transport-https iptables-persistent

# --- Swap -------------------------------------------------------------------
# `next build` is memory-hungry. Cheap insurance against the OOM killer.
if ! sudo swapon --show | grep -q '/swapfile'; then
  log "Creating 4G swapfile"
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  log "Swapfile already present, skipping"
fi

# --- Firewall ---------------------------------------------------------------
# Oracle's Ubuntu image ships a restrictive iptables INPUT chain that silently
# drops 80/443 even after you open the Security List in the OCI console. This
# is the single most common "my site won't load" cause on OCI.
log "Opening ports 80/443 in iptables"
for port in 80 443; do
  if ! sudo iptables -C INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$port" -j ACCEPT
  fi
done
sudo netfilter-persistent save

# --- Node 24 ----------------------------------------------------------------
if ! command -v node >/dev/null || [[ "$(node -v)" != v24.* ]]; then
  log "Installing Node.js 24 (arm64)"
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node $(node -v) already installed"
fi

log "Installing PM2"
sudo npm install -g pm2@latest

# --- PostgreSQL -------------------------------------------------------------
log "Installing PostgreSQL"
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# The app's pg pool has no SSL support (lib/server/db.ts), so Postgres must be
# local — it listens on 127.0.0.1 only, which is the default. Do not expose it.
DB_USER="aster"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)"
  # CREATEDB is required: scripts/db-migrate.ts calls ensureDatabase(), which
  # connects to the 'postgres' maintenance DB and CREATE DATABASE's if absent.
  sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}' CREATEDB;"
  log "Created Postgres role '${DB_USER}'"
  printf '\n\033[1;33mSAVE THIS — POSTGRES_PASSWORD:\033[0m %s\n\n' "$DB_PASS"
  echo "$DB_PASS" > "$HOME/.aster-db-password"
  chmod 600 "$HOME/.aster-db-password"
  echo "(also written to ~/.aster-db-password)"
else
  log "Postgres role '${DB_USER}' already exists, leaving password unchanged"
fi

# --- Caddy ------------------------------------------------------------------
if ! command -v caddy >/dev/null; then
  log "Installing Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
else
  log "Caddy already installed"
fi

log "Done. Versions:"
node -v && npm -v && pm2 -v && caddy version && psql --version

cat <<'EOF'

Next: clone the repo, write .env.local, migrate, build, start.
See deploy/README.md steps 6-10.
EOF
