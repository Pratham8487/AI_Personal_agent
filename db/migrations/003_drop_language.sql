-- 003: drop the language columns. The app is English-only — neither the
-- briefing output language (user_settings.language) nor the UI locale
-- (users.preferred_language) was ever read after the settings pickers came
-- out, so both are dead weight. Idempotent; applied once via schema_migrations.

ALTER TABLE public.user_settings DROP COLUMN IF EXISTS language;

ALTER TABLE public.users DROP COLUMN IF EXISTS preferred_language;
