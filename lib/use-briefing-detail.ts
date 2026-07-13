"use client";

import { useCallback, useEffect, useState } from "react";
import {
  sanitizeGeneratedBriefing,
  type GeneratedBriefing,
} from "./briefing-types";

const GENERIC_ERROR = "Could not load this briefing. Please retry.";

/**
 * Generated briefings are immutable, so a primed entry makes hub → detail
 * navigation paint instantly; deep links and refreshes fetch by id.
 */
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { data: GeneratedBriefing; fetchedAt: number }>();

/** Seeds the detail cache (called by useBriefings after fetch/generate). */
export function primeBriefingDetail(briefing: GeneratedBriefing): void {
  cache.set(briefing.id, { data: briefing, fetchedAt: Date.now() });
}

export type BriefingDetailState = {
  status: "idle" | "loading" | "error" | "ready";
  briefing: GeneratedBriefing | null;
  error: string | null;
  notFound: boolean;
  retry: () => void;
};

export function useBriefingDetail(
  userId: string | undefined,
  briefingId: string | undefined,
): BriefingDetailState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    briefing: GeneratedBriefing | null;
    error: string | null;
    notFound: boolean;
  } | null>(null);

  const key = userId && briefingId ? `${userId}:${briefingId}:${attempt}` : null;

  useEffect(() => {
    if (!key || !userId || !briefingId) return;
    const cached = cache.get(briefingId);
    if (
      attempt === 0 &&
      cached &&
      Date.now() - cached.fetchedAt < CACHE_TTL_MS
    ) {
      return;
    }
    let active = true;
    fetch(
      `/api/briefings/results?userId=${encodeURIComponent(userId)}&id=${encodeURIComponent(briefingId)}`,
    )
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (!active) return;
        if (res.status === 404) {
          setResult({ key, briefing: null, error: null, notFound: true });
          return;
        }
        if (!res.ok) {
          const { error } = (body ?? {}) as { error?: string };
          setResult({
            key,
            briefing: null,
            error: error ?? GENERIC_ERROR,
            notFound: false,
          });
          return;
        }
        const briefing = sanitizeGeneratedBriefing(
          (body as { result?: unknown })?.result,
        );
        if (!briefing) {
          setResult({ key, briefing: null, error: GENERIC_ERROR, notFound: false });
          return;
        }
        cache.set(briefing.id, { data: briefing, fetchedAt: Date.now() });
        setResult({ key, briefing, error: null, notFound: false });
      })
      .catch(() => {
        if (!active) return;
        setResult({ key, briefing: null, error: GENERIC_ERROR, notFound: false });
      });
    return () => {
      active = false;
    };
  }, [key, userId, briefingId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const own = result && result.key === key ? result : null;
  const cached = briefingId ? (cache.get(briefingId)?.data ?? null) : null;
  const briefing = own?.briefing ?? cached;

  return {
    status: !key
      ? "idle"
      : own?.error || own?.notFound
        ? "error"
        : briefing
          ? "ready"
          : "loading",
    briefing,
    error: own?.error ?? null,
    notFound: own?.notFound ?? false,
    retry,
  };
}
