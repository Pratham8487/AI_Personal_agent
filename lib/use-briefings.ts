"use client";

import { useCallback, useEffect, useState } from "react";
import {
  sanitizeBriefingDefinition,
  sanitizeBriefingSummaries,
  sanitizeGeneratedBriefing,
  type BriefingDefinition,
  type BriefingDefinitionInput,
  type BriefingsOverview,
  type GeneratedBriefing,
  type GeneratedBriefingSummary,
} from "./briefing-types";
import type { RefreshQuota } from "./dashboard-brief-types";
import { primeBriefingDetail } from "./use-briefing-detail";

export type BriefingsStatus = "idle" | "loading" | "error" | "ready";

const GENERIC_ERROR = "Could not load your briefings. Please retry.";

/**
 * Module-level cache so navigating between pages doesn't refetch (same
 * stale-while-revalidate pattern as lib/use-dashboard-brief.ts).
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: BriefingsOverview; fetchedAt: number }>();

function parseQuota(value: unknown): RefreshQuota | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { used, remaining, limit, nextRefreshAt } = value as Record<
    string,
    unknown
  >;
  if (typeof limit !== "number" || limit <= 0) return undefined;
  return {
    used: typeof used === "number" ? used : 0,
    remaining: typeof remaining === "number" ? Math.max(0, remaining) : 0,
    limit,
    nextRefreshAt: typeof nextRefreshAt === "string" ? nextRefreshAt : null,
  };
}

function parseOverview(value: unknown): BriefingsOverview | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const configs = (Array.isArray(raw.configs) ? raw.configs : [])
    .map(sanitizeBriefingDefinition)
    .filter((c): c is BriefingDefinition => c !== null);
  return {
    today: sanitizeGeneratedBriefing(raw.today),
    configs,
    history: sanitizeBriefingSummaries(raw.history),
    ...(parseQuota(raw.refresh) ? { refresh: parseQuota(raw.refresh) } : {}),
  };
}

function toSummary(result: GeneratedBriefing): GeneratedBriefingSummary {
  return {
    id: result.id,
    briefingId: result.briefingId,
    isDefault: result.isDefault,
    title: result.title,
    generatedAt: result.generatedAt,
    totalCount: Object.values(result.categories).reduce(
      (sum, c) => sum + (c?.count ?? 0),
      0,
    ),
    degraded: result.degraded,
  };
}

type FetchResult = {
  key: string;
  error: string | null;
  data: BriefingsOverview | null;
};

export type BriefingsState = {
  status: BriefingsStatus;
  data: BriefingsOverview | null;
  error: string | null;
  /** Quota notice from a rejected manual generation. */
  limitNotice: string | null;
  savingError: string | null;
  /** Briefing id currently generating (manual). */
  generatingId: string | null;
  retry: () => void;
  createBriefing: (
    input: BriefingDefinitionInput,
  ) => Promise<BriefingDefinition | null>;
  updateBriefing: (
    briefingId: string,
    input: BriefingDefinitionInput,
    enabled?: boolean,
  ) => Promise<BriefingDefinition | null>;
  deleteBriefing: (briefingId: string) => Promise<boolean>;
  generateNow: (briefingId: string) => Promise<GeneratedBriefing | null>;
};

/** Hub data: overview + config CRUD + manual generation. */
export function useBriefings(
  userId: string | undefined,
  enabled: boolean,
): BriefingsState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const key = userId && enabled ? `${userId}:${attempt}` : null;

  useEffect(() => {
    if (!key || !userId) return;
    const cached = cache.get(userId);
    if (
      attempt === 0 &&
      cached &&
      Date.now() - cached.fetchedAt < CACHE_TTL_MS
    ) {
      return;
    }
    let active = true;
    fetch("/api/briefings/overview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) {
          const { error } = (body ?? {}) as { error?: string };
          setResult({ key, error: error ?? GENERIC_ERROR, data: null });
          return;
        }
        const data = parseOverview(body);
        if (!data) {
          setResult({ key, error: GENERIC_ERROR, data: null });
          return;
        }
        cache.set(userId, { data, fetchedAt: Date.now() });
        if (data.today) primeBriefingDetail(data.today);
        setResult({ key, error: null, data });
      })
      .catch(() => {
        if (!active) return;
        setResult({ key, error: GENERIC_ERROR, data: null });
      });
    return () => {
      active = false;
    };
  }, [key, userId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Prefer this mount's own result; otherwise paint cached data immediately.
  const own = result && result.key === key ? result : null;
  const cachedData = key && userId ? (cache.get(userId)?.data ?? null) : null;
  const data = own?.data ?? cachedData;

  /**
   * Applies a local mutation to both the cache and this mount's state.
   * The cache is the source of truth here — every successful fetch and
   * mutation writes it, so it always holds the latest overview.
   */
  const applyData = useCallback(
    (updater: (current: BriefingsOverview) => BriefingsOverview) => {
      if (!userId) return;
      const current = cache.get(userId)?.data;
      if (!current) return;
      const updated = updater(current);
      cache.set(userId, { data: updated, fetchedAt: Date.now() });
      setResult((prev) => ({
        key: prev?.key ?? key ?? "",
        error: null,
        data: updated,
      }));
    },
    [userId, key],
  );

  const createBriefing = useCallback(
    async (input: BriefingDefinitionInput): Promise<BriefingDefinition | null> => {
      if (!userId) return null;
      setSavingError(null);
      try {
        const res = await fetch("/api/briefings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, ...input }),
        });
        const body: unknown = await res.json().catch(() => null);
        const briefing = res.ok
          ? sanitizeBriefingDefinition((body as { briefing?: unknown })?.briefing)
          : null;
        if (!briefing) {
          const { error } = (body ?? {}) as { error?: string };
          setSavingError(error ?? "Could not create the briefing.");
          return null;
        }
        applyData((current) => ({
          ...current,
          configs: [
            ...current.configs.filter((c) => c.isDefault),
            briefing,
            ...current.configs.filter((c) => !c.isDefault),
          ],
        }));
        return briefing;
      } catch {
        setSavingError("Could not create the briefing.");
        return null;
      }
    },
    [userId, applyData],
  );

  const updateBriefing = useCallback(
    async (
      briefingId: string,
      input: BriefingDefinitionInput,
      enabledFlag = true,
    ): Promise<BriefingDefinition | null> => {
      if (!userId) return null;
      setSavingError(null);
      try {
        const res = await fetch("/api/briefings/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, briefingId, enabled: enabledFlag, ...input }),
        });
        const body: unknown = await res.json().catch(() => null);
        const briefing = res.ok
          ? sanitizeBriefingDefinition((body as { briefing?: unknown })?.briefing)
          : null;
        if (!briefing) {
          const { error } = (body ?? {}) as { error?: string };
          setSavingError(error ?? "Could not update the briefing.");
          return null;
        }
        applyData((current) => ({
          ...current,
          configs: current.configs.map((c) => (c.id === briefing.id ? briefing : c)),
        }));
        return briefing;
      } catch {
        setSavingError("Could not update the briefing.");
        return null;
      }
    },
    [userId, applyData],
  );

  const deleteBriefing = useCallback(
    async (briefingId: string): Promise<boolean> => {
      if (!userId) return false;
      setSavingError(null);
      try {
        const res = await fetch("/api/briefings/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, briefingId }),
        });
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          const { error } = (body ?? {}) as { error?: string };
          setSavingError(error ?? "Could not delete the briefing.");
          return false;
        }
        applyData((current) => ({
          ...current,
          configs: current.configs.filter((c) => c.id !== briefingId),
          history: current.history.filter((h) => h.briefingId !== briefingId),
        }));
        return true;
      } catch {
        setSavingError("Could not delete the briefing.");
        return false;
      }
    },
    [userId, applyData],
  );

  const generateNow = useCallback(
    async (briefingId: string): Promise<GeneratedBriefing | null> => {
      if (!userId) return null;
      setLimitNotice(null);
      setGeneratingId(briefingId);
      try {
        const res = await fetch("/api/briefings/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, briefingId }),
        });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const { error, message, reason, remainingRefreshes, nextRefreshAt } =
            (body ?? {}) as {
              error?: string;
              message?: string;
              reason?: string;
              remainingRefreshes?: number;
              nextRefreshAt?: string | null;
            };
          if (reason === "refresh_limit_reached") {
            // Quota exhausted: keep current data, sync the quota, notify.
            setLimitNotice(message ?? "You've reached today's generation limit.");
            applyData((current) => ({
              ...current,
              refresh: current.refresh
                ? {
                    ...current.refresh,
                    used: current.refresh.limit,
                    remaining: remainingRefreshes ?? 0,
                    nextRefreshAt:
                      nextRefreshAt ?? current.refresh.nextRefreshAt,
                  }
                : current.refresh,
            }));
          } else {
            setLimitNotice(error ?? message ?? "Could not generate the briefing.");
          }
          return null;
        }
        const raw = (body ?? {}) as { result?: unknown; refresh?: unknown };
        const generated = sanitizeGeneratedBriefing(raw.result);
        if (!generated) {
          setLimitNotice("Could not generate the briefing.");
          return null;
        }
        primeBriefingDetail(generated);
        const quota = parseQuota(raw.refresh);
        applyData((current) => ({
          ...current,
          today: generated.isDefault ? generated : current.today,
          history: [toSummary(generated), ...current.history].slice(0, 20),
          configs: current.configs.map((c) =>
            c.id === briefingId
              ? { ...c, lastGeneratedAt: generated.generatedAt }
              : c,
          ),
          ...(quota ? { refresh: quota } : {}),
        }));
        return generated;
      } catch {
        setLimitNotice("Could not generate the briefing.");
        return null;
      } finally {
        setGeneratingId(null);
      }
    },
    [userId, applyData],
  );

  const status: BriefingsStatus = !key
    ? "idle"
    : own?.error
      ? "error"
      : data
        ? "ready"
        : "loading";

  return {
    status,
    data,
    error: own?.error ?? null,
    limitNotice,
    savingError,
    generatingId,
    retry,
    createBriefing,
    updateBriefing,
    deleteBriefing,
    generateNow,
  };
}
