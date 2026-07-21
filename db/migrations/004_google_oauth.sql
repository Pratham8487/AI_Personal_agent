-- 004: one Google grant per user, shared by every Google integration.
--
-- Gmail used to own the only Google OAuth grant, so the table was named after
-- it. Google Calendar now joins the same grant through incremental
-- authorization (include_granted_scopes=true), so a user already connected to
-- Gmail only consents to the new Calendar scopes. One row per user holds the
-- union of granted scopes; user_integrations still tracks which apps are on.
-- Idempotent; applied once via schema_migrations.

ALTER TABLE IF EXISTS public.gmail_oauth_tokens RENAME TO google_oauth_tokens;

-- Fresh databases that never carried the old name.
CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  user_id       uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  access_token  text NOT NULL,
  refresh_token text,
  expires_at    timestamptz NOT NULL,
  scope         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
