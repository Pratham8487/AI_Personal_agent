-- Aster schema — idempotent; safe to re-run.
-- gen_random_uuid() is core in PostgreSQL 13+; no extension needed.

-- ---------------------------------------------------------------------------
-- Users + auth
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text UNIQUE,
  name                text,
  avatar_url          text,
  providers           text[] NOT NULL DEFAULT '{}',
  email_verified      boolean NOT NULL DEFAULT false,
  phone               text UNIQUE,
  verification_method text,
  password_hash       text,
  last_login_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;

CREATE TABLE IF NOT EXISTS public.sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON public.sessions (expires_at);

-- OAuth account linkage (e.g. Google `sub`), so sign-in matches accounts
-- by provider id rather than by mutable email.
CREATE TABLE IF NOT EXISTS public.user_identities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider            text NOT NULL,
  provider_account_id text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS public.phone_otps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  otp_hash    text NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_otps_phone_idx
  ON public.phone_otps (phone, created_at DESC);

-- ---------------------------------------------------------------------------
-- Per-user app data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider     text NOT NULL,
  status       text NOT NULL DEFAULT 'disconnected',
  connected_at timestamptz,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id       uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  briefing_time text NOT NULL DEFAULT '08:00',
  timezone      text NOT NULL DEFAULT 'UTC',
  language      text NOT NULL DEFAULT 'English',
  channels      jsonb NOT NULL DEFAULT '{"email": true, "slack": false, "in_app": true, "whatsapp": false}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gmail_oauth_tokens (
  user_id       uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  access_token  text NOT NULL,
  refresh_token text,
  expires_at    timestamptz NOT NULL,
  scope         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_auth_state (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key        text NOT NULL,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chat_jid    text NOT NULL,
  msg_id      text NOT NULL,
  sender_jid  text,
  sender_name text,
  from_me     boolean NOT NULL DEFAULT false,
  text        text,
  msg_type    text,
  sent_at     timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chat_jid, msg_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_chat_idx
  ON public.whatsapp_messages (user_id, chat_jid, sent_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_recent_idx
  ON public.whatsapp_messages (user_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_chats (
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  jid             text NOT NULL,
  name            text,
  is_group        boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, jid)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  user_id           uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  phone             text NOT NULL,
  wa_jid            text,
  linked_at         timestamptz,
  last_connected_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dashboard_briefs (
  user_id      uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  signature    text NOT NULL,
  data         jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Code-owned tables. These definitions MUST stay verbatim copies of the
-- lazy DDL in lib/server/agent/schema.ts, lib/server/briefing/schema.ts and
-- lib/server/dashboard/refresh-limit.ts so the in-code ensure*() calls
-- remain no-ops.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_conversations_user_idx
  ON agent_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id         uuid NOT NULL,
  role            text NOT NULL,
  content         text NOT NULL,
  apps            jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_messages_conversation_idx
  ON agent_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS briefings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  is_default    boolean NOT NULL DEFAULT false,
  apps          jsonb NOT NULL DEFAULT '[]'::jsonb,
  categories    jsonb NOT NULL DEFAULT '["email","messages","mentions","tasks","follow_ups"]'::jsonb,
  priority      text NOT NULL DEFAULT 'medium',
  frequency     text NOT NULL DEFAULT 'daily',
  schedule_time text NOT NULL DEFAULT '08:00',
  timezone      text NOT NULL DEFAULT 'UTC',
  run_at        timestamptz,
  enabled       boolean NOT NULL DEFAULT true,
  next_run_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS briefings_default_per_user
  ON briefings (user_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS briefings_due_idx
  ON briefings (next_run_at) WHERE enabled;
CREATE INDEX IF NOT EXISTS briefings_user_idx
  ON briefings (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS briefing_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id   uuid NOT NULL,
  user_id       uuid NOT NULL,
  scheduled_for timestamptz NOT NULL,
  source        text NOT NULL DEFAULT 'schedule',
  status        text NOT NULL DEFAULT 'queued',
  started_at    timestamptz,
  finished_at   timestamptz,
  error         text,
  result_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS briefing_runs_slot_uniq
  ON briefing_runs (briefing_id, scheduled_for);
CREATE INDEX IF NOT EXISTS briefing_runs_user_idx
  ON briefing_runs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS briefing_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id  uuid NOT NULL,
  user_id      uuid NOT NULL,
  run_id       uuid,
  data         jsonb NOT NULL,
  degraded     boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS briefing_results_user_time_idx
  ON briefing_results (user_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS briefing_results_briefing_idx
  ON briefing_results (briefing_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS ai_refresh_logs (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  feature text NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_refresh_logs_user_feature_time_idx
  ON ai_refresh_logs (user_id, feature, refreshed_at DESC);
