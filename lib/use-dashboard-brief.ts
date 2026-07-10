"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeBrief, type DashboardBrief } from "./dashboard-brief-types";

export type BriefStatus = "idle" | "loading" | "error" | "ready";

export type DashboardBriefState = {
  status: BriefStatus;
  data: DashboardBrief | null;
  error: string | null;
  notConfigured: boolean;
  isRegenerating: boolean;
  retry: () => void;
  regenerate: () => void;
};

const GENERIC_ERROR = "Could not load your brief. Please retry.";

type FetchResult = {
  key: string;
  error: string | null;
  notConfigured: boolean;
  data: DashboardBrief | null;
};

/**
 * Module-level cache so navigating between pages doesn't refetch (same
 * stale-while-revalidate pattern as lib/use-gmail-data.ts). Regenerate
 * bypasses it and the server cache via force.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: DashboardBrief; fetchedAt: number }>();

/** Fetches the AI dashboard brief for the user's connected apps. */
export function useDashboardBrief(
  userId: string | undefined,
  enabled: boolean,
): DashboardBriefState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const forceRef = useRef(false);

  const key = userId && enabled ? `${userId}:${attempt}` : null;

  useEffect(() => {
    if (!key || !userId) return;
    const force = forceRef.current;
    forceRef.current = false;
    const cached = cache.get(userId);
    if (
      !force &&
      attempt === 0 &&
      cached &&
      Date.now() - cached.fetchedAt < CACHE_TTL_MS
    ) {
      return;
    }
    let active = true;
    if (force) setIsRegenerating(true);
    fetch("/api/dashboard/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, force }),
    })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) {
          const { error, code } = (body ?? {}) as {
            error?: string;
            code?: string;
          };
          setResult({
            key,
            error: error ?? GENERIC_ERROR,
            notConfigured: code === "not_configured",
            data: null,
          });
          return;
        }
        const data = sanitizeBrief(body);
        if (!data) {
          setResult({ key, error: GENERIC_ERROR, notConfigured: false, data: null });
          return;
        }
        cache.set(userId, { data, fetchedAt: Date.now() });
        setResult({ key, error: null, notConfigured: false, data });
      })
      .catch(() => {
        if (!active) return;
        setResult({ key, error: GENERIC_ERROR, notConfigured: false, data: null });
      })
      .finally(() => {
        if (active) setIsRegenerating(false);
      });
    return () => {
      active = false;
    };
  }, [key, userId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const regenerate = useCallback(() => {
    forceRef.current = true;
    setAttempt((n) => n + 1);
  }, []);

  // Prefer this mount's own result; otherwise paint cached data immediately
  // (keeps existing content visible while a regenerate is in flight).
  const own = result && result.key === key ? result : null;
  const cachedData = key && userId ? (cache.get(userId)?.data ?? null) : null;
  const data = own?.data ?? cachedData;
  const status: BriefStatus = !key
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
    notConfigured: own?.notConfigured ?? false,
    isRegenerating,
    retry,
    regenerate,
  };
}
