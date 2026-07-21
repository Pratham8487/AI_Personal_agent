"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { apiFetch } from "./auth-client";
import { errorMessage } from "./error-message";

export type IntegrationStatus = {
  status: string;
  connected_at: string | null;
};

type StatusMap = Record<string, IntegrationStatus>;
type FlagMap = Record<string, boolean>;
type ErrorMap = Record<string, string | null>;

const SAVE_ERROR = "Could not save your connection. Please retry.";

/**
 * Providers that connect by leaving the app for an OAuth consent screen. The
 * flow finishes at /api/integrations/<id>/callback, which stores the tokens
 * server-side and flips the DB status; the auth route derives the user from
 * the session cookie.
 */
const OAUTH_PROVIDERS = ["gmail", "google-calendar", "outlook"];

/** Providers whose disconnect tears down server-side state (tokens, sockets). */
const MANAGED_DISCONNECT = ["gmail", "google-calendar", "outlook", "whatsapp"];

/**
 * Statuses per user, kept across page navigations so returning to a page
 * paints instantly instead of refetching. Connect/disconnect update it; the
 * OAuth redirect fully reloads the app, which clears it and refetches.
 * The userId key is purely a client-side cache key — the server derives the
 * real user from the session cookie.
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
    apiFetch("/api/integrations/status")
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as {
          integrations: { provider: string; status: string; connected_at: string | null }[];
        };
      })
      .then((data) => {
        if (!active) return;
        const map: StatusMap = {};
        for (const row of data.integrations) {
          map[row.provider] = {
            status: row.status,
            connected_at: row.connected_at ?? null,
          };
        }
        statusCache.set(userId, map);
        setLoadError(null);
        bump();
      })
      .catch((error) => {
        if (!active) return;
        console.error("Failed to load integrations:", errorMessage(error));
        setLoadError("Could not load your integrations.");
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
      const res = await apiFetch("/api/integrations/status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, status }),
      });
      if (!res.ok) throw new Error(`integration update failed (${res.status})`);
      const data = (await res.json()) as {
        integration: { status: string; connected_at: string | null };
      };
      applyStatus(userId, providerId, data.integration.status, data.integration.connected_at);
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
      if (OAUTH_PROVIDERS.includes(providerId)) {
        setPending((prev) => ({ ...prev, [providerId]: true }));
        window.location.assign(`/api/integrations/${providerId}/auth`);
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
        if (MANAGED_DISCONNECT.includes(providerId)) {
          const res = await apiFetch(
            `/api/integrations/${providerId}/disconnect`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: uid }),
            },
          );
          if (!res.ok) {
            throw new Error(`${providerId} disconnect failed (${res.status})`);
          }
          applyStatus(uid, providerId, "disconnected", null);
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
