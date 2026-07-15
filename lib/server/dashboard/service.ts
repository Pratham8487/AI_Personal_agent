import {
  sanitizeDashboard,
  type BriefEntry,
  type ConnectedApp,
  type DashboardData,
  type PriorityItem,
  type RefreshQuota,
} from "@/lib/dashboard-brief-types";
import { generateAiBrief } from "@/lib/server/brief-ai";
import { adminSql } from "@/lib/server/db";
import {
  envInt,
  getRefreshQuota,
  recordRefresh,
  RefreshLimitError,
  type RefreshPolicy,
} from "./refresh-limit";
import {
  timeKey,
  titleKey,
  type DashboardProvider,
  type ProviderSnapshot,
} from "./provider";
import { DASHBOARD_PROVIDERS } from "./registry";

/** Per-provider fetch budget; a slow provider degrades, never blocks. */
const PROVIDER_TIMEOUT_MS = 12_000;

/**
 * Generated dashboards are persisted in the dashboard_briefs table and reused
 * until the cache expires; only Refresh (force) regenerates earlier, gated by
 * the rolling manual-refresh quota. The sources signature invalidates the row
 * when a provider is connected or disconnected. Degraded (AI-unavailable) and
 * partial dashboards expire quickly so recovery is picked up.
 */
const CACHE_TTL_MS = envInt("AI_DASHBOARD_CACHE_MINUTES", 60) * 60_000;
const DEGRADED_TTL_MS = 2 * 60_000;

/** Manual-refresh policy; automatic cache-expiry regenerations are free. */
const REFRESH_FEATURE = "dashboard";
const REFRESH_POLICY: RefreshPolicy = {
  limit: envInt("AI_DASHBOARD_REFRESH_LIMIT", 3),
  windowMs: envInt("AI_DASHBOARD_REFRESH_WINDOW_HOURS", 24) * 60 * 60_000,
};

export { RefreshLimitError };

const MAX_PRIORITY_ITEMS = 4;

/** Every connected provider failed or timed out; the route maps this to 502. */
export class NoProviderDataError extends Error {
  constructor() {
    super("No connected app returned data.");
    this.name = "NoProviderDataError";
  }
}

type Fetched = { provider: DashboardProvider; snapshot: ProviderSnapshot };

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${PROVIDER_TIMEOUT_MS}ms`)),
        PROVIDER_TIMEOUT_MS,
      ),
    ),
  ]);
}

async function readStored(
  userId: string,
  signature: string,
  ignoreTtl = false,
): Promise<DashboardData | null> {
  const rows = await adminSql<{ data: unknown; generated_at: string }>(
    "SELECT data, generated_at FROM dashboard_briefs WHERE user_id = $1 AND signature = $2",
    [userId, signature],
  );
  const row = rows[0];
  if (!row) return null;
  const data = sanitizeDashboard(row.data);
  if (!data) return null;
  if (ignoreTtl) return data;
  const age = Date.now() - new Date(row.generated_at).getTime();
  // Degraded/partial results expire quickly so recovery is picked up.
  const ttl = data.degraded || data.partial ? DEGRADED_TTL_MS : CACHE_TTL_MS;
  return Number.isFinite(age) && age < ttl ? data : null;
}

async function store(
  userId: string,
  signature: string,
  data: DashboardData,
): Promise<void> {
  await adminSql(
    `INSERT INTO dashboard_briefs (user_id, signature, data, generated_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (user_id)
     DO UPDATE SET signature = $2, data = $3::jsonb, generated_at = $4`,
    [userId, signature, JSON.stringify(data), data.lastUpdated],
  );
}

function emptyDashboard(
  connectedApps: ConnectedApp[],
  lastUpdated: string,
): DashboardData {
  return {
    importantCount: 0,
    priorityCount: 0,
    followUpCount: 0,
    connectedApps,
    brief: [],
    priorityItems: [],
    lastUpdated,
    degraded: false,
  };
}

/** Mechanical dashboard when the AI is unavailable — never shows garbage. */
function fallbackDashboard(
  fetched: Fetched[],
  connectedApps: ConnectedApp[],
  lastUpdated: string,
): DashboardData {
  const importantCount = fetched.reduce(
    (sum, f) => sum + f.snapshot.importantCount,
    0,
  );
  const followUpCount = fetched.reduce(
    (sum, f) => sum + f.snapshot.followUpCount,
    0,
  );
  const brief: BriefEntry[] = fetched.flatMap((f) => f.snapshot.fallbackBrief);
  // Untagged entry renders under "Today's Focus" on the dashboard.
  if (followUpCount > 0) {
    brief.push({
      text: "Reply to the messages that have been waiting on you.",
      apps: [],
    });
  } else if (importantCount > 0) {
    brief.push({ text: "Clear your unread messages.", apps: [] });
  }
  const priorityItems = fetched
    .flatMap((f) => f.snapshot.fallbackItems)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_PRIORITY_ITEMS);
  return {
    importantCount,
    priorityCount: priorityItems.length,
    followUpCount,
    connectedApps,
    brief,
    priorityItems,
    lastUpdated,
    degraded: true,
  };
}

/** Attaches per-response metadata (quota, cache expiry); never persisted. */
function withMeta(data: DashboardData, quota: RefreshQuota): DashboardData {
  const generatedAt = Date.parse(data.lastUpdated);
  return {
    ...data,
    ...(Number.isFinite(generatedAt)
      ? {
          summaryExpiresAt: new Date(generatedAt + CACHE_TTL_MS).toISOString(),
        }
      : {}),
    refresh: quota,
  };
}

/**
 * One in-flight build per user: concurrent requests (double-clicks, parallel
 * tabs) share the running promise instead of triggering duplicate AI calls.
 * Per-process guard; the DB cache covers cross-instance deployments.
 */
const inflight = new Map<string, Promise<DashboardData>>();

/**
 * Aggregates every connected provider into one dashboard response:
 * reads connection state, serves the cached summary while it is fresh,
 * fetches + normalizes provider data in parallel (with per-provider
 * timeouts), asks the AI to prioritize, and falls back to the previous
 * cached summary — else a mechanical one — when the AI is unavailable.
 * Manual refreshes (force) are quota-gated; automatic regenerations are not.
 */
export function buildDashboard(
  userId: string,
  force: boolean,
): Promise<DashboardData> {
  const running = inflight.get(userId);
  if (running) return running;
  const run = buildDashboardInner(userId, force).finally(() =>
    inflight.delete(userId),
  );
  inflight.set(userId, run);
  return run;
}

async function buildDashboardInner(
  userId: string,
  force: boolean,
): Promise<DashboardData> {
  const rows = await adminSql<{ provider: string }>(
    "SELECT provider FROM user_integrations WHERE user_id = $1 AND status = 'connected'",
    [userId],
  );
  const connectedIds = new Set(rows.map((row) => row.provider));
  const providers = DASHBOARD_PROVIDERS.filter((p) => connectedIds.has(p.id));
  const connectedApps: ConnectedApp[] = DASHBOARD_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    connected: connectedIds.has(p.id),
    icon: p.icon,
  }));
  const now = new Date().toISOString();
  const quota = await getRefreshQuota(userId, REFRESH_FEATURE, REFRESH_POLICY);

  if (providers.length === 0)
    return withMeta(emptyDashboard(connectedApps, now), quota);

  const signature = providers.map((p) => p.id).join(",");
  if (force) {
    // Backend-enforced: once the quota is exhausted the AI is never called.
    if (quota.remaining <= 0) throw new RefreshLimitError(quota);
  } else {
    // Fresh cached summary → no AI call, no refresh consumed.
    const stored = await readStored(userId, signature);
    if (stored) return withMeta({ ...stored, connectedApps }, quota);
  }

  const results = await Promise.all(
    providers.map(async (provider): Promise<Fetched | null> => {
      try {
        const snapshot = await withTimeout(
          provider.fetchSnapshot(userId),
          provider.name,
        );
        return { provider, snapshot };
      } catch (error) {
        console.error(`Dashboard: ${provider.id} fetch failed:`, error);
        return null;
      }
    }),
  );
  const fetched = results.filter((r): r is Fetched => r !== null);
  if (fetched.length === 0) throw new NoProviderDataError();
  // One provider down → keep serving the rest, flagged for the UI.
  const partial = fetched.length < providers.length;

  // Nothing to summarize (e.g. empty inbox) — skip the AI call entirely.
  if (fetched.every((f) => f.snapshot.isEmpty)) {
    const data = emptyDashboard(connectedApps, now);
    await store(userId, signature, data);
    return withMeta(data, quota);
  }

  const sources = fetched.map((f) => f.provider.id);
  const links: Record<string, string> = Object.assign(
    {},
    ...fetched.map((f) => f.snapshot.links ?? {}),
  );
  // Statistics are mechanical, computed from provider data — the AI only
  // writes the brief and picks priority items; its counts are ignored.
  const importantCount = fetched.reduce(
    (sum, f) => sum + f.snapshot.importantCount,
    0,
  );
  const followUpCount = fetched.reduce(
    (sum, f) => sum + f.snapshot.followUpCount,
    0,
  );
  let data: DashboardData;
  try {
    const ai = await generateAiBrief(
      {
        now,
        sources,
        data: Object.fromEntries(
          fetched.map((f) => [f.provider.id, f.snapshot.aiPayload]),
        ),
      },
      fetched.map((f) => f.provider.promptHint),
    );
    // Resolve deep links: by the AI's echoed ref, else deterministically by
    // the item's timestamp or title. ref never leaves the server.
    const priorityItems = ai.priorityItems.map(
      ({ ref, ...item }): PriorityItem => {
        const link =
          (ref ? links[ref] : undefined) ??
          links[timeKey(item.timestamp) ?? ""] ??
          links[titleKey(item.title) ?? ""];
        return link ? { ...item, link } : item;
      },
    );
    data = {
      brief: ai.brief,
      priorityItems,
      importantCount,
      followUpCount,
      priorityCount: priorityItems.length,
      connectedApps,
      lastUpdated: now,
      degraded: false,
      partial,
    };
  } catch (error) {
    console.error("Dashboard: AI generation failed:", error);
    // Prefer the previous cached summary (any age); no refresh is consumed.
    const stale = await readStored(userId, signature, true);
    if (stale) return withMeta({ ...stale, connectedApps }, quota);
    data = { ...fallbackDashboard(fetched, connectedApps, now), partial };
    await store(userId, signature, data);
    return withMeta(data, quota);
  }

  await store(userId, signature, data);
  if (!force) return withMeta(data, quota);

  // Only a successful manual regeneration consumes a refresh slot.
  await recordRefresh(userId, REFRESH_FEATURE, REFRESH_POLICY);
  return withMeta(
    data,
    await getRefreshQuota(userId, REFRESH_FEATURE, REFRESH_POLICY),
  );
}
