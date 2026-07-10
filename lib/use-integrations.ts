"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { errorMessage } from "./error-message";
import { insforge } from "./insforge";

export type IntegrationStatus = {
  status: string;
  connected_at: string | null;
};

type StatusMap = Record<string, IntegrationStatus>;
type FlagMap = Record<string, boolean>;
type ErrorMap = Record<string, string | null>;

const SAVE_ERROR = "Could not save your connection. Please retry.";

/**
 * Statuses per user, kept across page navigations so returning to a page
 * paints instantly instead of refetching (and possibly hanging on a slow
 * backend). Connect/disconnect update it; the OAuth redirect fully reloads
 * the app, which clears it and refetches.
 */
const statusCache = new Map<string, StatusMap>();

export function useIntegrations(userId: string | undefined) {
  // Cache mutations re-render through this counter.
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<FlagMap>({});
  const [errors, setErrors] = useState<ErrorMap>({});

  useEffect(() => {
    if (!userId || statusCache.has(userId)) return;
    let active = true;
    insforge.database
      .from("user_integrations")
      .select("provider,status,connected_at")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error(
            "Failed to load integrations:",
            error.message || "unknown error",
          );
          setLoadError("Could not load your integrations.");
          return;
        }
        const map: StatusMap = {};
        for (const row of data ?? []) {
          map[row.provider as string] = {
            status: row.status as string,
            connected_at: (row.connected_at as string | null) ?? null,
          };
        }
        statusCache.set(userId, map);
        setLoadError(null);
        bump();
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const applyStatus = useCallback(
    (uid: string, providerId: string, status: string, connectedAt: string | null) => {
      const map = { ...(statusCache.get(uid) ?? {}) };
      map[providerId] = { status, connected_at: connectedAt };
      statusCache.set(uid, map);
      bump();
    },
    [],
  );

  const setStatus = useCallback(
    async (providerId: string, status: "connected" | "disconnected") => {
      if (!userId) return;
      const now = new Date().toISOString();
      const connectedAt = status === "connected" ? now : null;

      const { data: existing, error: selectError } = await insforge.database
        .from("user_integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", providerId)
        .maybeSingle();
      if (selectError) throw selectError;

      if (existing) {
        const { error } = await insforge.database
          .from("user_integrations")
          .update({ status, connected_at: connectedAt, updated_at: now })
          .eq("id", existing.id as string);
        if (error) throw error;
      } else {
        const { error } = await insforge.database
          .from("user_integrations")
          .insert([
            {
              user_id: userId,
              provider: providerId,
              status,
              connected_at: connectedAt,
            },
          ]);
        if (error) throw error;
      }

      applyStatus(userId, providerId, status, connectedAt);
    },
    [userId, applyStatus],
  );

  const run = useCallback(
    async (providerId: string, action: () => Promise<void>) => {
      setPending((prev) => ({ ...prev, [providerId]: true }));
      setErrors((prev) => ({ ...prev, [providerId]: null }));
      try {
        await action();
      } catch (error) {
        console.error(
          `Integration update failed (${providerId}):`,
          errorMessage(error),
        );
        setErrors((prev) => ({ ...prev, [providerId]: SAVE_ERROR }));
      } finally {
        setPending((prev) => ({ ...prev, [providerId]: false }));
      }
    },
    [],
  );

  const connect = useCallback(
    async (providerId: string) => {
      if (!userId || pending[providerId]) return;
      if (providerId === "gmail") {
        // Google's consent flow finishes at /api/integrations/gmail/callback,
        // which stores the tokens server-side and flips the DB status.
        setPending((prev) => ({ ...prev, gmail: true }));
        window.location.assign(`/api/integrations/gmail/auth?uid=${userId}`);
        return;
      }
      // WhatsApp connects through the pairing dialog, not a status flip.
      if (providerId === "whatsapp") return;
      await run(providerId, () => setStatus(providerId, "connected"));
    },
    [userId, pending, run, setStatus],
  );

  const disconnect = useCallback(
    async (providerId: string) => {
      if (!userId || pending[providerId]) return;
      const uid = userId;
      await run(providerId, async () => {
        if (providerId === "gmail") {
          const res = await fetch("/api/integrations/gmail/disconnect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: uid }),
          });
          if (!res.ok) throw new Error(`Gmail disconnect failed (${res.status})`);
          applyStatus(uid, "gmail", "disconnected", null);
          return;
        }
        if (providerId === "whatsapp") {
          const res = await fetch("/api/integrations/whatsapp/disconnect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: uid }),
          });
          if (!res.ok) {
            throw new Error(`WhatsApp disconnect failed (${res.status})`);
          }
          applyStatus(uid, "whatsapp", "disconnected", null);
          return;
        }
        await setStatus(providerId, "disconnected");
      });
    },
    [userId, pending, run, setStatus, applyStatus],
  );

  /** Updates the cached status without a DB write (the server already did). */
  const setStatusLocal = useCallback(
    (providerId: string, status: "connected" | "disconnected") => {
      if (!userId) return;
      applyStatus(
        userId,
        providerId,
        status,
        status === "connected" ? new Date().toISOString() : null,
      );
    },
    [userId, applyStatus],
  );

  const statuses: StatusMap = (userId && statusCache.get(userId)) || {};
  const isLoading = userId ? !statusCache.has(userId) && !loadError : false;

  return {
    statuses,
    isLoading,
    loadError,
    pending,
    errors,
    connect,
    disconnect,
    setStatusLocal,
  };
}
