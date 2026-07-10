"use client";

import { useCallback, useEffect, useState } from "react";
import {
  callGmailMcpBatch,
  parseCountResult,
  parseMessages,
  parseProfile,
  type CountStat,
  type EmailSummary,
  type GmailProfile,
} from "./gmail-mcp-client";

export type GmailDataStatus = "idle" | "loading" | "error" | "ready";

export type DayActivity = { day: string; value: number };

export type GmailData = {
  status: GmailDataStatus;
  emails: EmailSummary[];
  unread: EmailSummary[];
  awaiting: EmailSummary[];
  profile: GmailProfile | null;
  unreadCount: CountStat;
  awaitingCount: CountStat;
  weekly: DayActivity[];
  error: string | null;
  retry: () => void;
};

/** Unread for 2+ days — the "waiting on your reply" proxy. */
const AWAITING_QUERY = "in:inbox is:unread older_than:2d";

const DAY_MS = 86_400_000;

/** Last 7 local days (oldest first), as epoch-bounded Gmail queries. */
function weekWindows(): { day: string; query: string }[] {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days: { day: string; query: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const from = new Date(midnight.getTime() - i * DAY_MS);
    const to = new Date(from.getTime() + DAY_MS);
    days.push({
      day: from.toLocaleDateString("en-US", { weekday: "short" }),
      query: `in:inbox after:${Math.floor(from.getTime() / 1000)} before:${Math.floor(to.getTime() / 1000)}`,
    });
  }
  return days;
}

type FetchResult = {
  key: string;
  error: string | null;
  emails: EmailSummary[];
  unread: EmailSummary[];
  awaiting: EmailSummary[];
  profile: GmailProfile | null;
  unreadCount: CountStat;
  awaitingCount: CountStat;
  weekly: DayActivity[];
};

const ZERO: CountStat = { count: 0, capped: false };

const EMPTY: Omit<FetchResult, "key" | "error"> = {
  emails: [],
  unread: [],
  awaiting: [],
  profile: null,
  unreadCount: ZERO,
  awaitingCount: ZERO,
  weekly: [],
};

/**
 * Module-level cache so navigating between pages doesn't refetch.
 * Fresh entries are served instantly; stale ones still paint immediately
 * while a background refresh replaces them (stale-while-revalidate).
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: FetchResult; fetchedAt: number }>();

/** Fetches inbox, unread, follow-ups, profile, and weekly counts in one MCP batch. */
export function useGmailData(
  userId: string | undefined,
  enabled: boolean,
): GmailData {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<FetchResult | null>(null);

  // Status is derived from key/result so the effect never sets state directly.
  const key = userId && enabled ? `${userId}:${attempt}` : null;

  useEffect(() => {
    if (!key || !userId) return;
    // A fresh cache entry means nothing to do; retries (attempt > 0) always fetch.
    const cached = cache.get(userId);
    if (
      attempt === 0 &&
      cached &&
      Date.now() - cached.fetchedAt < CACHE_TTL_MS
    ) {
      return;
    }
    let active = true;
    const week = weekWindows();
    callGmailMcpBatch(userId, [
      { name: "read_emails", args: { count: 5 } },
      { name: "search_inbox", args: { query: "is:unread", count: 5 } },
      { name: "search_inbox", args: { query: AWAITING_QUERY, count: 5 } },
      { name: "get_profile" },
      { name: "count_messages", args: { query: "is:unread" } },
      { name: "count_messages", args: { query: AWAITING_QUERY } },
      ...week.map((w) => ({ name: "count_messages", args: { query: w.query } })),
    ])
      .then((results) => {
        if (!active) return;
        const failed = results.find((r) => !r.ok);
        if (failed) {
          setResult({ key, error: failed.message, ...EMPTY });
          return;
        }
        const data: FetchResult = {
          key,
          error: null,
          emails: parseMessages(results[0].structured) ?? [],
          unread: parseMessages(results[1].structured) ?? [],
          awaiting: parseMessages(results[2].structured) ?? [],
          profile: parseProfile(results[3].structured),
          unreadCount: parseCountResult(results[4].structured) ?? ZERO,
          awaitingCount: parseCountResult(results[5].structured) ?? ZERO,
          weekly: week.map((w, i) => ({
            day: w.day,
            value: parseCountResult(results[6 + i].structured)?.count ?? 0,
          })),
        };
        cache.set(userId, { data, fetchedAt: Date.now() });
        setResult(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setResult({
          key,
          error:
            err instanceof Error ? err.message : "Could not load Gmail data.",
          ...EMPTY,
        });
      });
    return () => {
      active = false;
    };
  }, [key, userId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Prefer this mount's own result; otherwise paint cached data immediately.
  const own = result && result.key === key ? result : null;
  const cachedData = key && userId ? (cache.get(userId)?.data ?? null) : null;
  const current = own ?? cachedData;
  const status: GmailDataStatus = !key
    ? "idle"
    : !current
      ? "loading"
      : current.error
        ? "error"
        : "ready";

  return {
    status,
    emails: current?.emails ?? [],
    unread: current?.unread ?? [],
    awaiting: current?.awaiting ?? [],
    profile: current?.profile ?? null,
    unreadCount: current?.unreadCount ?? ZERO,
    awaitingCount: current?.awaitingCount ?? ZERO,
    weekly: current?.weekly ?? [],
    error: current?.error ?? null,
    retry,
  };
}
