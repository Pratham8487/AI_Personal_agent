-- 005: one Microsoft Entra grant per user, backing the Outlook integration.
--
-- Mirrors 004_google_oauth.sql, with one structural difference forced by Entra:
-- an access token is issued per *resource*, and a single token can never span
-- two of them. Outlook talks to three official Work IQ MCP servers (Mail,
-- Calendar, and the universal server), so the cross-resource refresh token
-- lives in microsoft_oauth_tokens and the per-resource access tokens hang off
-- it in microsoft_access_tokens.
--
-- The refresh token rotates on every redemption, so the grant row is written
-- far more often than google_oauth_tokens is. tenant_id is captured from the
-- id_token's `tid` claim: both MCP endpoint URLs and their OAuth scopes embed
-- it, so nothing Microsoft-side can be addressed until it is known.
-- Idempotent; applied once via schema_migrations.

CREATE TABLE IF NOT EXISTS public.microsoft_oauth_tokens (
  user_id       uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id     text NOT NULL,
  username      text,
  refresh_token text NOT NULL,
  scope         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.microsoft_access_tokens (
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resource     text NOT NULL,
  access_token text NOT NULL,
  expires_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, resource)
);
