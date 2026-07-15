import { adminSql } from "@/lib/server/db";

/**
 * Lazy one-time table setup per process (same convention as
 * lib/server/dashboard/refresh-limit.ts); survives restarts via Postgres.
 */

const STATEMENTS = [
  // Briefing definitions: user-created configs plus one materialized
  // default "Daily brief" row per user (reconciled from user_settings).
  `CREATE TABLE IF NOT EXISTS briefings (
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
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS briefings_default_per_user
     ON briefings (user_id) WHERE is_default`,
  `CREATE INDEX IF NOT EXISTS briefings_due_idx
     ON briefings (next_run_at) WHERE enabled`,
  `CREATE INDEX IF NOT EXISTS briefings_user_idx
     ON briefings (user_id, created_at DESC)`,
  // Run bookkeeping. The unique (briefing_id, scheduled_for) index is THE
  // dedup mechanism: overlapping cron windows insert-or-skip atomically.
  `CREATE TABLE IF NOT EXISTS briefing_runs (
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
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS briefing_runs_slot_uniq
     ON briefing_runs (briefing_id, scheduled_for)`,
  `CREATE INDEX IF NOT EXISTS briefing_runs_user_idx
     ON briefing_runs (user_id, created_at DESC)`,
  // Generated results (history; pruned to the newest 30 per briefing).
  `CREATE TABLE IF NOT EXISTS briefing_results (
     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     briefing_id  uuid NOT NULL,
     user_id      uuid NOT NULL,
     run_id       uuid,
     data         jsonb NOT NULL,
     degraded     boolean NOT NULL DEFAULT false,
     generated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS briefing_results_user_time_idx
     ON briefing_results (user_id, generated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS briefing_results_briefing_idx
     ON briefing_results (briefing_id, generated_at DESC)`,
];

let ensured: Promise<void> | null = null;

export function ensureBriefingTables(): Promise<void> {
  ensured ??= (async () => {
    for (const statement of STATEMENTS) await adminSql(statement);
  })().catch((error) => {
    ensured = null; // retry on next call
    throw error;
  });
  return ensured;
}
