import type { BriefingFrequency } from "@/lib/briefing-types";
import { adminSql } from "@/lib/server/db";
import { ensureBriefingTables } from "./schema";

/**
 * All schedule math runs in Postgres with IANA zone names, so wall-clock
 * times ("08:00" in Asia/Kolkata) survive DST without any JS date deps.
 */

export class InvalidScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScheduleError";
  }
}

/**
 * Browsers (ICU) still report legacy IANA ids, and this database ships a
 * slim tzdata that may only know one spelling — map both directions so
 * either name resolves to whichever the database actually recognizes.
 */
const TZ_ALIASES: [string, string][] = [
  ["Asia/Calcutta", "Asia/Kolkata"],
  ["Asia/Katmandu", "Asia/Kathmandu"],
  ["Asia/Rangoon", "Asia/Yangon"],
  ["Asia/Saigon", "Asia/Ho_Chi_Minh"],
  ["Europe/Kiev", "Europe/Kyiv"],
  ["America/Buenos_Aires", "America/Argentina/Buenos_Aires"],
  ["America/Godthab", "America/Nuuk"],
  ["Atlantic/Faeroe", "Atlantic/Faroe"],
  ["Africa/Asmera", "Africa/Asmara"],
  ["Asia/Ulan_Bator", "Asia/Ulaanbaatar"],
  ["Pacific/Ponape", "Pacific/Pohnpei"],
  ["Pacific/Truk", "Pacific/Chuuk"],
];

/** SQL VALUES fragment of the alias pairs, both directions (static, safe). */
const ALIAS_VALUES = TZ_ALIASES.flatMap(([a, b]) => [
  `('${a.toLowerCase()}','${b}')`,
  `('${b.toLowerCase()}','${a}')`,
]).join(",");

/** Canonical database timezone name for `tz`, or null when unusable. */
export async function resolveTimezone(tz: string): Promise<string | null> {
  const lower = tz.trim().toLowerCase();
  if (!lower) return null;
  const candidates = [tz.trim()];
  for (const [a, b] of TZ_ALIASES) {
    if (a.toLowerCase() === lower) candidates.push(b);
    if (b.toLowerCase() === lower) candidates.push(a);
  }
  for (const candidate of candidates) {
    const rows = await adminSql<{ name: string }>(
      "SELECT name FROM pg_timezone_names WHERE lower(name) = lower($1) LIMIT 1",
      [candidate],
    );
    if (rows[0]) return rows[0].name;
  }
  return null;
}

/**
 * Next UTC instant a definition should run: for "once" the given moment,
 * otherwise the next occurrence of the local HH:MM (weekend-adjusted for
 * "weekdays"). Returns the database-canonical timezone alongside — callers
 * must persist it, because every stored timezone is later fed to
 * AT TIME ZONE in the claim query. Throws InvalidScheduleError on bad
 * timezone or past run_at.
 */
export async function computeNextRun(input: {
  frequency: BriefingFrequency;
  scheduleTime: string;
  timezone: string;
  runAt?: string;
}): Promise<{ nextRunAt: string; timezone: string }> {
  if (input.frequency === "once") {
    const at = Date.parse(input.runAt ?? "");
    if (Number.isNaN(at)) {
      throw new InvalidScheduleError("A valid date and time is required.");
    }
    if (at <= Date.now()) {
      throw new InvalidScheduleError("The scheduled time must be in the future.");
    }
    // run_at is absolute; the timezone only needs to be storable/safe.
    return {
      nextRunAt: new Date(at).toISOString(),
      timezone: (await resolveTimezone(input.timezone)) ?? "UTC",
    };
  }
  const timezone = await resolveTimezone(input.timezone);
  if (!timezone) throw new InvalidScheduleError("Unknown timezone.");
  const rows = await adminSql<{ next_run_at: string }>(
    `SELECT ((d + CASE WHEN $3 = 'weekdays'
              THEN (CASE EXTRACT(ISODOW FROM d)::int WHEN 6 THEN 2 WHEN 7 THEN 1 ELSE 0 END)
              ELSE 0 END) + $2::time) AT TIME ZONE $1 AS next_run_at
     FROM (
       SELECT CASE
         WHEN (((now() AT TIME ZONE $1)::date + $2::time) AT TIME ZONE $1) > now()
         THEN (now() AT TIME ZONE $1)::date
         ELSE (now() AT TIME ZONE $1)::date + 1
       END AS d
     ) x`,
    [timezone, input.scheduleTime, input.frequency],
  );
  return { nextRunAt: rows[0].next_run_at, timezone };
}

export type ClaimedRun = {
  run_id: string;
  briefing_id: string;
  user_id: string;
  scheduled_for: string;
};

/**
 * Atomically claims every briefing due inside the window and advances its
 * schedule. The unique (briefing_id, scheduled_for) index makes overlapping
 * cron ticks skip already-claimed slots. The advance is anchored on the
 * claimed slot's local date (never before today), so early claims cannot
 * re-produce the same slot and long outages don't replay every missed day.
 */
export async function claimDueRuns(windowMinutes: number): Promise<ClaimedRun[]> {
  await ensureBriefingTables();
  return adminSql<ClaimedRun>(
    `WITH claimed AS (
       INSERT INTO briefing_runs (briefing_id, user_id, scheduled_for, source)
       SELECT id, user_id, next_run_at, 'schedule'
       FROM briefings
       WHERE enabled AND next_run_at IS NOT NULL
         AND next_run_at <= now() + make_interval(mins => $1::int)
       ON CONFLICT (briefing_id, scheduled_for) DO NOTHING
       RETURNING id AS run_id, briefing_id, user_id, scheduled_for
     ),
     advanced AS (
       UPDATE briefings b
       SET next_run_at = CASE b2.frequency
             WHEN 'once' THEN NULL
             WHEN 'weekly' THEN ((g.d + 6) + b2.schedule_time::time) AT TIME ZONE b2.timezone
             WHEN 'weekdays' THEN ((g.d + CASE EXTRACT(ISODOW FROM g.d)::int
                 WHEN 6 THEN 2 WHEN 7 THEN 1 ELSE 0 END)
               + b2.schedule_time::time) AT TIME ZONE b2.timezone
             ELSE (g.d + b2.schedule_time::time) AT TIME ZONE b2.timezone
           END,
           updated_at = now()
       FROM claimed c
       JOIN briefings b2 ON b2.id = c.briefing_id
       CROSS JOIN LATERAL (
         SELECT GREATEST(
           (c.scheduled_for AT TIME ZONE b2.timezone)::date,
           (now() AT TIME ZONE b2.timezone)::date
         ) + 1 AS d
       ) g
       WHERE b.id = c.briefing_id
     )
     SELECT run_id, briefing_id, user_id, scheduled_for FROM claimed`,
    [windowMinutes],
  );
}

/**
 * Queued schedule runs whose slot passed but never started — an enqueue that
 * was lost after a successful claim. Safe to re-enqueue: the Trigger.dev
 * idempotencyKey is the run id, and markRunning is a guarded transition.
 */
export async function staleQueuedRuns(): Promise<ClaimedRun[]> {
  await ensureBriefingTables();
  return adminSql<ClaimedRun>(
    `SELECT id AS run_id, briefing_id, user_id, scheduled_for
     FROM briefing_runs
     WHERE status = 'queued' AND source = 'schedule'
       AND scheduled_for <= now()
       AND created_at <= now() - interval '20 minutes'`,
  );
}

/**
 * Materializes/refreshes the per-user default "Daily brief" row from
 * user_settings for every user with a connected integration. Self-healing:
 * runs on every cron tick; settings edits propagate within one tick. The
 * user's enabled toggle and a pending next_run_at are preserved unless the
 * scheduled time or timezone changed. Pass a userId to reconcile one user
 * eagerly (the hub overview does this so "Generate now" works before the
 * first cron tick).
 */
export async function reconcileDefaultBriefings(userId?: string): Promise<void> {
  await ensureBriefingTables();
  await adminSql(
    `INSERT INTO briefings
       (user_id, name, description, is_default, apps, categories,
        priority, frequency, schedule_time, timezone, next_run_at)
     SELECT u.user_id, 'Daily brief', 'Your automatic daily briefing.', true,
       '[]'::jsonb, '["email","messages","mentions","tasks","follow_ups"]'::jsonb,
       'medium', 'daily', v.t, v.tz,
       CASE WHEN (((now() AT TIME ZONE v.tz)::date + v.t::time) AT TIME ZONE v.tz) > now()
            THEN ((now() AT TIME ZONE v.tz)::date + v.t::time) AT TIME ZONE v.tz
            ELSE ((now() AT TIME ZONE v.tz)::date + 1 + v.t::time) AT TIME ZONE v.tz END
     FROM (SELECT DISTINCT user_id FROM user_integrations
           WHERE status = 'connected' AND ($1::uuid IS NULL OR user_id = $1::uuid)) u
     LEFT JOIN user_settings us ON us.user_id = u.user_id
     CROSS JOIN LATERAL (SELECT
       CASE WHEN us.briefing_time ~ '^\\d{2}:\\d{2}$' THEN us.briefing_time ELSE '08:00' END AS t,
       COALESCE(
         (SELECT n.name FROM pg_timezone_names n
          WHERE lower(n.name) = lower(us.timezone) LIMIT 1),
         (SELECT n2.name FROM (VALUES ${ALIAS_VALUES}) al(legacy, modern)
          JOIN pg_timezone_names n2 ON lower(n2.name) = lower(al.modern)
          WHERE al.legacy = lower(us.timezone) LIMIT 1),
         'UTC') AS tz) v
     ON CONFLICT (user_id) WHERE is_default DO UPDATE SET
       schedule_time = EXCLUDED.schedule_time,
       timezone      = EXCLUDED.timezone,
       next_run_at   = CASE WHEN briefings.schedule_time = EXCLUDED.schedule_time
                             AND briefings.timezone = EXCLUDED.timezone
                             AND briefings.next_run_at IS NOT NULL
                            THEN briefings.next_run_at ELSE EXCLUDED.next_run_at END,
       updated_at    = now()`,
    [userId ?? null],
  );
}
