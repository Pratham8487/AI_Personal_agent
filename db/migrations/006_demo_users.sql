-- 006: temporary "Try Demo" users.
--
-- A demo user is an ordinary users row (provider 'demo') with a session, so it
-- inherits every page, connector and per-user limit for free. Two columns mark
-- it as throwaway: is_demo flags the row, demo_expires_at drives a heartbeat +
-- sweep lifecycle so the account and all its data are reaped once the tab
-- closes. Normal accounts keep is_demo = false and demo_expires_at NULL, so
-- nothing about existing auth changes. Idempotent; applied once via
-- schema_migrations.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_demo         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz;

-- Partial index: the reaper only ever scans demo rows by expiry.
CREATE INDEX IF NOT EXISTS users_demo_expiry_idx
  ON public.users (demo_expires_at) WHERE is_demo;
