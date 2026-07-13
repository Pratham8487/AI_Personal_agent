import type { RefreshQuota } from "@/lib/dashboard-brief-types";
import { adminSql } from "@/lib/server/phone-auth";

/**
 * Generic, persisted rolling-window limiter for expensive AI operations.
 * Independent of the dashboard: each feature passes its own key and policy,
 * so future AI features (agent, briefing, …) can reuse it unchanged.
 */

export type RefreshPolicy = {
  limit: number;
  windowMs: number;
};

/** Positive-integer env read with a safe default; never trusts bad values. */
export function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Thrown instead of calling the AI when the user's quota is exhausted. */
export class RefreshLimitError extends Error {
  constructor(public readonly quota: RefreshQuota) {
    super("Refresh limit reached.");
    this.name = "RefreshLimitError";
  }
}

/** Lazy one-time table setup per process; survives restarts via Postgres. */
let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  ensured ??= adminSql(
    `CREATE TABLE IF NOT EXISTS ai_refresh_logs (
       id bigserial PRIMARY KEY,
       user_id uuid NOT NULL,
       feature text NOT NULL,
       refreshed_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
    .then(() =>
      adminSql(
        `CREATE INDEX IF NOT EXISTS ai_refresh_logs_user_feature_time_idx
         ON ai_refresh_logs (user_id, feature, refreshed_at DESC)`,
      ),
    )
    .then(() => undefined)
    .catch((error) => {
      ensured = null; // retry on next call
      throw error;
    });
  return ensured;
}

/** Current usage inside the rolling window, oldest-first. */
async function windowRows(
  userId: string,
  feature: string,
  policy: RefreshPolicy,
): Promise<{ refreshed_at: string }[]> {
  await ensureTable();
  const since = new Date(Date.now() - policy.windowMs).toISOString();
  return adminSql<{ refreshed_at: string }>(
    `SELECT refreshed_at FROM ai_refresh_logs
     WHERE user_id = $1 AND feature = $2 AND refreshed_at > $3
     ORDER BY refreshed_at ASC`,
    [userId, feature, since],
  );
}

export async function getRefreshQuota(
  userId: string,
  feature: string,
  policy: RefreshPolicy,
): Promise<RefreshQuota> {
  const rows = await windowRows(userId, feature, policy);
  const used = rows.length;
  const oldest = rows[0];
  return {
    used,
    remaining: Math.max(0, policy.limit - used),
    limit: policy.limit,
    // The window rolls: a slot frees up when the oldest refresh ages out.
    nextRefreshAt:
      used >= policy.limit && oldest
        ? new Date(
            Date.parse(oldest.refreshed_at) + policy.windowMs,
          ).toISOString()
        : null,
  };
}

/** Records one consumed refresh and prunes rows that left the window. */
export async function recordRefresh(
  userId: string,
  feature: string,
  policy: RefreshPolicy,
): Promise<void> {
  await ensureTable();
  const cutoff = new Date(Date.now() - policy.windowMs).toISOString();
  await adminSql(
    `WITH ins AS (
       INSERT INTO ai_refresh_logs (user_id, feature) VALUES ($1, $2)
     )
     DELETE FROM ai_refresh_logs
     WHERE user_id = $1 AND feature = $2 AND refreshed_at < $3`,
    [userId, feature, cutoff],
  );
}
