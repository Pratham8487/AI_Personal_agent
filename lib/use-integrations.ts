"use client";

import { useCallback, useEffect, useState } from "react";
import { insforge } from "./insforge";

export type IntegrationStatus = {
  status: string;
  connected_at: string | null;
};

type StatusMap = Record<string, IntegrationStatus>;
type FlagMap = Record<string, boolean>;
type ErrorMap = Record<string, string | null>;

const SAVE_ERROR = "Could not save your connection. Please retry.";

export function useIntegrations(userId: string | undefined) {
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<FlagMap>({});
  const [errors, setErrors] = useState<ErrorMap>({});

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    insforge.database
      .from("user_integrations")
      .select("provider,status,connected_at")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Failed to load integrations:", error);
          setLoadError("Could not load your integrations.");
        } else {
          const map: StatusMap = {};
          for (const row of data ?? []) {
            map[row.provider as string] = {
              status: row.status as string,
              connected_at: (row.connected_at as string | null) ?? null,
            };
          }
          setStatuses(map);
          setLoadError(null);
        }
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

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

      setStatuses((prev) => ({
        ...prev,
        [providerId]: { status, connected_at: connectedAt },
      }));
    },
    [userId],
  );

  const run = useCallback(
    async (providerId: string, action: () => Promise<void>) => {
      setPending((prev) => ({ ...prev, [providerId]: true }));
      setErrors((prev) => ({ ...prev, [providerId]: null }));
      try {
        await action();
      } catch (error) {
        console.error(`Integration update failed (${providerId}):`, error);
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
      await run(providerId, () => setStatus(providerId, "connected"));
    },
    [userId, pending, run, setStatus],
  );

  const disconnect = useCallback(
    async (providerId: string) => {
      if (!userId || pending[providerId]) return;
      await run(providerId, async () => {
        if (providerId === "gmail") {
          const res = await fetch("/api/integrations/gmail/disconnect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          if (!res.ok) throw new Error(`Gmail disconnect failed (${res.status})`);
          setStatuses((prev) => ({
            ...prev,
            gmail: { status: "disconnected", connected_at: null },
          }));
          return;
        }
        await setStatus(providerId, "disconnected");
      });
    },
    [userId, pending, run, setStatus],
  );

  return { statuses, isLoading, loadError, pending, errors, connect, disconnect };
}
