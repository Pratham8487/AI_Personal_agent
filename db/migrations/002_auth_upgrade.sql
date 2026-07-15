-- 002: access/refresh token pair, generic OTP store, password reset,
-- new user flags. Idempotent; applied once via schema_migrations.

-- ---------------------------------------------------------------------------
-- users: new columns + backfill
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_language varchar(5) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS contact_verified   boolean    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tour_completed     boolean    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active             boolean    NOT NULL DEFAULT true;

-- Existing users are already onboarded — don't re-tour them; a phone or a
-- verified email on file means the contact was verified at signup.
UPDATE public.users SET tour_completed = true;
UPDATE public.users SET contact_verified = true
 WHERE phone IS NOT NULL OR email_verified;

-- ---------------------------------------------------------------------------
-- Generic OTP store (replaces phone_otps)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_otp_verifications (
  id            bigserial PRIMARY KEY,
  -- NULLABLE on purpose: phone OTPs are verified BEFORE the user row exists.
  user_id       uuid REFERENCES public.users(id) ON DELETE CASCADE,
  otp_type      text NOT NULL CHECK (otp_type IN
                  ('EMAIL_VERIFICATION','LOGIN','PASSWORD_RESET','PHONE_VERIFICATION')),
  target        text NOT NULL,              -- lowercased email or E.164 phone
  otp_hash      text NOT NULL,
  attempt_count int  NOT NULL DEFAULT 0,
  max_attempts  int  NOT NULL DEFAULT 5,
  expires_at    timestamptz NOT NULL,
  verified_at   timestamptz,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_otp_verifications_target_idx
  ON public.user_otp_verifications (otp_type, target, created_at DESC);
CREATE INDEX IF NOT EXISTS user_otp_verifications_user_idx
  ON public.user_otp_verifications (user_id);

-- ---------------------------------------------------------------------------
-- Password reset audit/lifecycle
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id               bigserial PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reset_token_hash text NOT NULL,           -- same HMAC hash as the OTP row
  expires_at       timestamptz NOT NULL,
  used_at          timestamptz,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_requests_user_idx
  ON public.password_reset_requests (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Access/refresh token pair (replaces sessions)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_access_tokens (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_prefix varchar(16) NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  last_used_at timestamptz,
  device_info  text,
  ip_address   varchar(64),
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked      boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS user_access_tokens_prefix_idx
  ON public.user_access_tokens (token_prefix, revoked, expires_at);
CREATE INDEX IF NOT EXISTS user_access_tokens_user_idx
  ON public.user_access_tokens (user_id);

CREATE TABLE IF NOT EXISTS public.user_refresh_tokens (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  access_token_id bigint NOT NULL REFERENCES public.user_access_tokens(id) ON DELETE CASCADE,
  -- Rotation-family id so reuse of a revoked refresh token can revoke every
  -- descendant (theft detection). Deliberate addition to the Django model.
  family_id       uuid NOT NULL,
  token_prefix    varchar(16) NOT NULL,
  token_hash      text NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  revoked         boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS user_refresh_tokens_prefix_idx
  ON public.user_refresh_tokens (token_prefix, revoked, expires_at);
CREATE INDEX IF NOT EXISTS user_refresh_tokens_user_idx
  ON public.user_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS user_refresh_tokens_family_idx
  ON public.user_refresh_tokens (family_id);

-- ---------------------------------------------------------------------------
-- Retire replaced tables. sessions: everyone re-logs-in once (old cookie
-- name is different, stale cookies are inert). phone_otps: had 0 rows.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.sessions;
DROP TABLE IF EXISTS public.phone_otps;
