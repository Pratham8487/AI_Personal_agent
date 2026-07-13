import type {
  BriefingsOverview,
  GeneratedBriefing,
} from "@/lib/briefing-types";
import {
  envInt,
  getRefreshQuota,
  recordRefresh,
  RefreshLimitError,
  type RefreshPolicy,
} from "@/lib/server/dashboard/refresh-limit";
import { generateBriefing } from "./generate";
import { reconcileDefaultBriefings } from "./schedule";
import {
  getDefinition,
  getRun,
  insertManualRun,
  insertResult,
  latestDefaultResult,
  listDefinitions,
  listResultSummaries,
  markFailed,
  markRunning,
  markSucceeded,
} from "./store";

export { RefreshLimitError };
export { NoProviderDataError } from "@/lib/server/dashboard/service";

/** Manual "Generate now" policy; scheduled generations are free. */
const REFRESH_FEATURE = "briefing";
const REFRESH_POLICY: RefreshPolicy = {
  limit: envInt("AI_BRIEFING_REFRESH_LIMIT", 3),
  windowMs: envInt("AI_BRIEFING_REFRESH_WINDOW_HOURS", 24) * 60 * 60_000,
};

/** The run already finished successfully; the route maps this to 409. */
export class AlreadyDoneError extends Error {
  constructor() {
    super("This briefing run already completed.");
    this.name = "AlreadyDoneError";
  }
}

/** The run/definition no longer exists or is disabled; maps to 410. */
export class RunGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunGoneError";
  }
}

/** The briefing definition does not exist for this user; maps to 404. */
export class BriefingNotFoundError extends Error {
  constructor() {
    super("Briefing not found.");
    this.name = "BriefingNotFoundError";
  }
}

/**
 * Executes one claimed run end-to-end: guarded status transition, generate,
 * persist, mark. Called by the internal /run route (Trigger.dev) and inline
 * by generateNow. Idempotent: retries and duplicate deliveries are safe.
 */
export async function runBriefing(runId: string): Promise<string> {
  const run = await markRunning(runId);
  if (!run) {
    const existing = await getRun(runId);
    if (existing?.status === "succeeded") throw new AlreadyDoneError();
    if (existing) throw new RunGoneError("This briefing run is already in progress.");
    throw new RunGoneError("This briefing run no longer exists.");
  }
  try {
    const def = await getDefinition(run.user_id, run.briefing_id);
    if (!def || (!def.enabled && run.source === "schedule")) {
      throw new RunGoneError("This briefing was deleted or disabled.");
    }
    const data = await generateBriefing(run.user_id, def);
    const resultId = await insertResult(run.user_id, def.id, run.id, data);
    await markSucceeded(run.id, resultId);
    return resultId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await markFailed(run.id, message).catch(() => undefined);
    throw error;
  }
}

/**
 * One in-flight manual generation per briefing: double-clicks share the
 * running promise instead of triggering duplicate AI calls.
 */
const inflight = new Map<string, Promise<GeneratedBriefing>>();

export function generateNow(
  userId: string,
  briefingId: string,
): Promise<GeneratedBriefing> {
  const key = `${userId}:${briefingId}`;
  const running = inflight.get(key);
  if (running) return running;
  const run = generateNowInner(userId, briefingId).finally(() =>
    inflight.delete(key),
  );
  inflight.set(key, run);
  return run;
}

async function generateNowInner(
  userId: string,
  briefingId: string,
): Promise<GeneratedBriefing> {
  const def = await getDefinition(userId, briefingId);
  if (!def) throw new BriefingNotFoundError();
  // Backend-enforced: once the quota is exhausted the AI is never called.
  const quota = await getRefreshQuota(userId, REFRESH_FEATURE, REFRESH_POLICY);
  if (quota.remaining <= 0) throw new RefreshLimitError(quota);

  const runId = await insertManualRun(userId, def.id);
  const run = await markRunning(runId);
  if (!run) throw new RunGoneError("Could not start this briefing run.");
  let data: GeneratedBriefing;
  try {
    const generated = await generateBriefing(userId, def);
    const resultId = await insertResult(userId, def.id, runId, generated);
    await markSucceeded(runId, resultId);
    data = {
      ...generated,
      id: resultId,
      briefingId: def.id,
      isDefault: def.isDefault,
      title: def.name,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await markFailed(runId, message).catch(() => undefined);
    throw error;
  }
  // Only a successful manual generation consumes a refresh slot.
  await recordRefresh(userId, REFRESH_FEATURE, REFRESH_POLICY);
  return data;
}

export async function getBriefingQuota(userId: string) {
  return getRefreshQuota(userId, REFRESH_FEATURE, REFRESH_POLICY);
}

/** Everything the hub page needs in one round trip. */
export async function getOverview(userId: string): Promise<BriefingsOverview> {
  // Materialize the default daily brief eagerly so the hub can offer
  // "Generate now" before the first scheduler tick.
  await reconcileDefaultBriefings(userId).catch((error) =>
    console.error("Briefings: default reconcile failed:", error),
  );
  const [today, configs, history, refresh] = await Promise.all([
    latestDefaultResult(userId),
    listDefinitions(userId),
    listResultSummaries(userId, { limit: 20 }),
    getBriefingQuota(userId),
  ]);
  return { today, configs, history, refresh };
}
