"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { apiFetch } from "./auth-client";
import { errorMessage } from "./error-message";

export type DeliveryChannels = {
  in_app: boolean;
  email: boolean;
  slack: boolean;
  whatsapp: boolean;
};

export type UserSettings = {
  briefing_time: string; // "08:00" (24h)
  timezone: string;
  channels: DeliveryChannels;
};

/** Settings per user, kept across navigations (same pattern as integrations).
 * The userId key is purely a client-side cache key — the server derives the
 * real user from the session cookie. */
const settingsCache = new Map<string, UserSettings>();

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function parseChannels(value: unknown): DeliveryChannels {
  const raw = (value ?? {}) as Partial<Record<keyof DeliveryChannels, unknown>>;
  return {
    in_app: raw.in_app !== false,
    email: raw.email !== false,
    slack: raw.slack === true,
    whatsapp: raw.whatsapp === true,
  };
}

export function useUserSettings(userId: string | undefined) {
  // Cache mutations re-render through this counter.
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || settingsCache.has(userId)) return;
    let active = true;
    apiFetch("/api/settings")
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as {
          settings: {
            briefing_time?: string;
            timezone?: string;
            channels?: unknown;
          } | null;
        };
      })
      .then(({ settings: data }) => {
        if (!active) return;
        settingsCache.set(userId, {
          briefing_time: data?.briefing_time ?? "08:00",
          timezone: data?.timezone ?? detectTimezone(),
          channels: parseChannels(data?.channels),
        });
        setLoadError(null);
        bump();
      })
      .catch((error) => {
        if (!active) return;
        console.error("Failed to load settings:", errorMessage(error));
        setLoadError("Could not load your settings.");
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!userId) return;
      const current = settingsCache.get(userId);
      if (!current) return;
      const next: UserSettings = {
        ...current,
        ...patch,
        channels: { ...current.channels, ...(patch.channels ?? {}) },
      };
      // Optimistic: paint immediately, revert on failure.
      settingsCache.set(userId, next);
      bump();
      setIsSaving(true);
      setSaveError(null);
      try {
        const res = await apiFetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
      } catch (error) {
        console.error("Failed to save settings:", errorMessage(error));
        settingsCache.set(userId, current);
        bump();
        setSaveError("Could not save your settings. Please retry.");
      } finally {
        setIsSaving(false);
      }
    },
    [userId],
  );

  const settings = userId ? (settingsCache.get(userId) ?? null) : null;
  const isLoading = userId ? !settingsCache.has(userId) && !loadError : false;

  return { settings, isLoading, loadError, isSaving, saveError, update };
}
