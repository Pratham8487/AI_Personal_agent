import {
  sanitizeBriefingResult,
  type BriefingCategoryId,
  type BriefingDefinition,
  type BriefingDefinitionInput,
  type BriefingFrequency,
  type BriefingResultData,
  type GeneratedBriefing,
  type GeneratedBriefingSummary,
  BRIEFING_CATEGORIES,
  BRIEFING_FREQUENCIES,
} from "@/lib/briefing-types";
import type { PriorityLevel } from "@/lib/dashboard-brief-types";
import { adminSql } from "@/lib/server/phone-auth";
import { ensureBriefingTables } from "./schema";

/** Rows kept per briefing; older results are pruned on insert. */
const HISTORY_LIMIT = 30;
/** Custom (non-default) definitions allowed per user. */
export const MAX_CUSTOM_BRIEFINGS = 10;

export type RunStatus = "queued" | "running" | "succeeded" | "failed";

export type RunRow = {
  id: string;
  briefing_id: string;
  user_id: string;
  scheduled_for: string;
  source: string;
  status: RunStatus;
};

type DefinitionRow = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  is_default: boolean;
  apps: unknown;
  categories: unknown;
  priority: string;
  frequency: string;
  schedule_time: string;
  timezone: string;
  run_at: string | null;
  enabled: boolean;
  next_run_at: string | null;
  created_at: string;
  last_generated_at?: string | null;
};

const DEFINITION_COLUMNS = `id, user_id, name, description, is_default, apps,
  categories, priority, frequency, schedule_time, timezone, run_at, enabled,
  next_run_at, created_at`;

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function toDefinition(row: DefinitionRow): BriefingDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isDefault: row.is_default,
    apps: parseStringArray(row.apps),
    categories: parseStringArray(row.categories).filter(
      (c): c is BriefingCategoryId =>
        (BRIEFING_CATEGORIES as readonly string[]).includes(c),
    ),
    priority: (["low", "medium", "high"].includes(row.priority)
      ? row.priority
      : "medium") as PriorityLevel,
    frequency: ((BRIEFING_FREQUENCIES as readonly string[]).includes(row.frequency)
      ? row.frequency
      : "daily") as BriefingFrequency,
    scheduleTime: row.schedule_time,
    timezone: row.timezone,
    ...(row.run_at ? { runAt: row.run_at } : {}),
    enabled: row.enabled,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    ...(row.last_generated_at ? { lastGeneratedAt: row.last_generated_at } : {}),
  };
}

export async function listDefinitions(
  userId: string,
): Promise<BriefingDefinition[]> {
  await ensureBriefingTables();
  const rows = await adminSql<DefinitionRow>(
    `SELECT b.*, r.generated_at AS last_generated_at
     FROM briefings b
     LEFT JOIN LATERAL (
       SELECT generated_at FROM briefing_results
       WHERE briefing_id = b.id ORDER BY generated_at DESC LIMIT 1
     ) r ON true
     WHERE b.user_id = $1
     ORDER BY b.is_default DESC, b.created_at DESC`,
    [userId],
  );
  return rows.map(toDefinition);
}

export async function getDefinition(
  userId: string,
  briefingId: string,
): Promise<BriefingDefinition | null> {
  await ensureBriefingTables();
  const rows = await adminSql<DefinitionRow>(
    `SELECT ${DEFINITION_COLUMNS} FROM briefings WHERE id = $1 AND user_id = $2`,
    [briefingId, userId],
  );
  return rows[0] ? toDefinition(rows[0]) : null;
}

export class BriefingCapError extends Error {
  constructor() {
    super(`You can keep at most ${MAX_CUSTOM_BRIEFINGS} custom briefings.`);
    this.name = "BriefingCapError";
  }
}

export async function createDefinition(
  userId: string,
  input: BriefingDefinitionInput,
  nextRunAt: string | null,
): Promise<BriefingDefinition> {
  await ensureBriefingTables();
  const count = await adminSql<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM briefings WHERE user_id = $1 AND NOT is_default",
    [userId],
  );
  if ((count[0]?.n ?? 0) >= MAX_CUSTOM_BRIEFINGS) throw new BriefingCapError();
  const rows = await adminSql<DefinitionRow>(
    `INSERT INTO briefings
       (user_id, name, description, apps, categories, priority, frequency,
        schedule_time, timezone, run_at, next_run_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11)
     RETURNING ${DEFINITION_COLUMNS}`,
    [
      userId,
      input.name,
      input.description,
      JSON.stringify(input.apps),
      JSON.stringify(input.categories),
      input.priority,
      input.frequency,
      input.scheduleTime,
      input.timezone,
      input.frequency === "once" ? (input.runAt ?? null) : null,
      nextRunAt,
    ],
  );
  return toDefinition(rows[0]);
}

/**
 * Updates a definition. The default row keeps its schedule managed by the
 * user_settings reconcile, so only content fields are applied to it.
 */
export async function updateDefinition(
  userId: string,
  briefingId: string,
  input: BriefingDefinitionInput,
  nextRunAt: string | null,
  enabled: boolean,
): Promise<BriefingDefinition | null> {
  await ensureBriefingTables();
  const rows = await adminSql<DefinitionRow>(
    `UPDATE briefings SET
       name          = CASE WHEN is_default THEN name ELSE $3 END,
       description   = $4,
       apps          = $5::jsonb,
       categories    = $6::jsonb,
       priority      = $7,
       frequency     = CASE WHEN is_default THEN frequency ELSE $8 END,
       schedule_time = CASE WHEN is_default THEN schedule_time ELSE $9 END,
       timezone      = CASE WHEN is_default THEN timezone ELSE $10 END,
       run_at        = CASE WHEN is_default THEN run_at
                            WHEN $8 = 'once' THEN $11 ELSE NULL END,
       next_run_at   = CASE WHEN is_default THEN next_run_at ELSE $12 END,
       enabled       = $13,
       updated_at    = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${DEFINITION_COLUMNS}`,
    [
      briefingId,
      userId,
      input.name,
      input.description,
      JSON.stringify(input.apps),
      JSON.stringify(input.categories),
      input.priority,
      input.frequency,
      input.scheduleTime,
      input.timezone,
      input.frequency === "once" ? (input.runAt ?? null) : null,
      nextRunAt,
      enabled,
    ],
  );
  return rows[0] ? toDefinition(rows[0]) : null;
}

/** Deletes a custom definition with its runs and results; default rows never. */
export async function deleteDefinition(
  userId: string,
  briefingId: string,
): Promise<boolean> {
  await ensureBriefingTables();
  const rows = await adminSql<{ id: string }>(
    `WITH victim AS (
       DELETE FROM briefings
       WHERE id = $1 AND user_id = $2 AND NOT is_default
       RETURNING id
     ),
     runs AS (
       DELETE FROM briefing_runs
       WHERE briefing_id IN (SELECT id FROM victim)
     ),
     results AS (
       DELETE FROM briefing_results
       WHERE briefing_id IN (SELECT id FROM victim)
     )
     SELECT id FROM victim`,
    [briefingId, userId],
  );
  return rows.length > 0;
}

/* ---------------------------------- runs --------------------------------- */

export async function insertManualRun(
  userId: string,
  briefingId: string,
): Promise<string> {
  await ensureBriefingTables();
  const rows = await adminSql<{ id: string }>(
    `INSERT INTO briefing_runs (briefing_id, user_id, scheduled_for, source)
     VALUES ($1, $2, now(), 'manual') RETURNING id`,
    [briefingId, userId],
  );
  return rows[0].id;
}

/**
 * Idempotent queued→running transition; a failed run may be retried, and a
 * run stuck in 'running' (process died mid-generation) can be taken over
 * after 10 minutes. Re-running a succeeded run returns null.
 */
export async function markRunning(runId: string): Promise<RunRow | null> {
  await ensureBriefingTables();
  const rows = await adminSql<RunRow>(
    `UPDATE briefing_runs
     SET status = 'running', started_at = now()
     WHERE id = $1 AND (
       status IN ('queued', 'failed')
       OR (status = 'running' AND started_at <= now() - interval '10 minutes')
     )
     RETURNING id, briefing_id, user_id, scheduled_for, source, status`,
    [runId],
  );
  return rows[0] ?? null;
}

export async function getRun(runId: string): Promise<RunRow | null> {
  await ensureBriefingTables();
  const rows = await adminSql<RunRow>(
    `SELECT id, briefing_id, user_id, scheduled_for, source, status
     FROM briefing_runs WHERE id = $1`,
    [runId],
  );
  return rows[0] ?? null;
}

export async function markSucceeded(
  runId: string,
  resultId: string,
): Promise<void> {
  await adminSql(
    `UPDATE briefing_runs
     SET status = 'succeeded', finished_at = now(), result_id = $2, error = NULL
     WHERE id = $1`,
    [runId, resultId],
  );
}

export async function markFailed(runId: string, message: string): Promise<void> {
  await adminSql(
    `UPDATE briefing_runs
     SET status = 'failed', finished_at = now(), error = $2
     WHERE id = $1`,
    [runId, message.slice(0, 500)],
  );
}

/* --------------------------------- results ------------------------------- */

export async function insertResult(
  userId: string,
  briefingId: string,
  runId: string | null,
  data: BriefingResultData,
): Promise<string> {
  await ensureBriefingTables();
  const rows = await adminSql<{ id: string }>(
    `INSERT INTO briefing_results (briefing_id, user_id, run_id, data, degraded, generated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING id`,
    [briefingId, userId, runId, JSON.stringify(data), data.degraded, data.generatedAt],
  );
  // Prune history beyond the newest rows for this briefing.
  await adminSql(
    `DELETE FROM briefing_results
     WHERE briefing_id = $1 AND id NOT IN (
       SELECT id FROM briefing_results
       WHERE briefing_id = $1 ORDER BY generated_at DESC LIMIT ${HISTORY_LIMIT}
     )`,
    [briefingId],
  );
  return rows[0].id;
}

type ResultRow = {
  id: string;
  briefing_id: string | null;
  data: unknown;
  generated_at: string;
  title: string | null;
  is_default: boolean | null;
};

function toGenerated(row: ResultRow): GeneratedBriefing | null {
  const data = sanitizeBriefingResult(row.data);
  if (!data) return null;
  return {
    ...data,
    id: row.id,
    briefingId: row.briefing_id,
    isDefault: row.is_default === true,
    title: row.title ?? "Briefing",
  };
}

const RESULT_SELECT = `SELECT r.id, r.briefing_id, r.data, r.generated_at,
    b.name AS title, b.is_default
  FROM briefing_results r
  LEFT JOIN briefings b ON b.id = r.briefing_id`;

export async function getResult(
  userId: string,
  resultId: string,
): Promise<GeneratedBriefing | null> {
  await ensureBriefingTables();
  const rows = await adminSql<ResultRow>(
    `${RESULT_SELECT} WHERE r.id = $1 AND r.user_id = $2`,
    [resultId, userId],
  );
  return rows[0] ? toGenerated(rows[0]) : null;
}

/** Latest result of the user's default daily brief (the hub hero). */
export async function latestDefaultResult(
  userId: string,
): Promise<GeneratedBriefing | null> {
  await ensureBriefingTables();
  const rows = await adminSql<ResultRow>(
    `${RESULT_SELECT}
     WHERE r.user_id = $1 AND b.is_default
     ORDER BY r.generated_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ? toGenerated(rows[0]) : null;
}

type SummaryRow = {
  id: string;
  briefing_id: string | null;
  generated_at: string;
  degraded: boolean;
  title: string | null;
  is_default: boolean | null;
  total_count: number;
};

export async function listResultSummaries(
  userId: string,
  options: { briefingId?: string; limit: number; before?: string },
): Promise<GeneratedBriefingSummary[]> {
  await ensureBriefingTables();
  const params: unknown[] = [userId];
  let where = "r.user_id = $1";
  if (options.briefingId) {
    params.push(options.briefingId);
    where += ` AND r.briefing_id = $${params.length}`;
  }
  if (options.before) {
    params.push(options.before);
    where += ` AND r.generated_at < $${params.length}`;
  }
  params.push(options.limit);
  const rows = await adminSql<SummaryRow>(
    `SELECT r.id, r.briefing_id, r.generated_at, r.degraded,
       b.name AS title, b.is_default,
       COALESCE((SELECT SUM((value->>'count')::int)
                 FROM jsonb_each(r.data->'categories')), 0)::int AS total_count
     FROM briefing_results r
     LEFT JOIN briefings b ON b.id = r.briefing_id
     WHERE ${where}
     ORDER BY r.generated_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    briefingId: row.briefing_id,
    isDefault: row.is_default === true,
    title: row.title ?? "Briefing",
    generatedAt: row.generated_at,
    totalCount: row.total_count,
    degraded: row.degraded,
  }));
}
