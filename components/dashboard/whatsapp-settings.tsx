"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { customArray } from "country-codes-list";
import Card from "./card";
import WhatsappToolRunner, { type WaMcpTool } from "./whatsapp-tool-runner";

// Longest dial code first so e.g. +1242 wins over +1; US preferred among ties.
const DIAL_CODES: { name: string; dial: string }[] = customArray({
  name: "{countryNameEn}",
  dial: "{countryCallingCode}",
})
  .map((entry) => ({ name: entry.name, dial: entry.dial.replace(/\D/g, "") }))
  .filter((entry) => entry.name && entry.dial)
  .sort(
    (a, b) =>
      b.dial.length - a.dial.length ||
      Number(b.name === "United States") - Number(a.name === "United States"),
  );

function countryFromPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return DIAL_CODES.find((entry) => digits.startsWith(entry.dial))?.name ?? null;
}

type WhatsappStatus = {
  linked: boolean;
  connection: "open" | "connecting" | "closed" | "none";
  phone: string | null;
  pairingPending: boolean;
};

const secondaryButtonClass =
  "rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

/** Connection details + live MCP tool list for the WhatsApp integration. */
export default function WhatsappSettings({
  userId,
  onDisconnected,
}: {
  userId: string;
  onDisconnected: () => void;
}) {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"reconnect" | "disconnect" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tools, setTools] = useState<WaMcpTool[] | null>(null);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openTool, setOpenTool] = useState<string | null>(null);

  const [autoConnecting, setAutoConnecting] = useState(false);
  const autoReconnectTried = useRef(false);

  const loadStatus = useCallback(
    (): Promise<WhatsappStatus | null> =>
      fetch(`/api/integrations/whatsapp/status?uid=${userId}`)
        .then(async (res) => {
          const body = (await res
            .json()
            .catch(() => null)) as WhatsappStatus | null;
          if (!res.ok || !body) throw new Error("status failed");
          setStatus(body);
          setStatusError(null);
          return body;
        })
        .catch(() => {
          setStatusError("Could not load the connection status.");
          return null;
        }),
    [userId],
  );

  useEffect(() => {
    void loadStatus().then((body) => {
      // Linked but no live socket (e.g. after a server restart): quietly
      // reopen the session once so the user rarely sees "No".
      if (
        !body?.linked ||
        body.connection === "open" ||
        body.pairingPending ||
        autoReconnectTried.current
      ) {
        return;
      }
      autoReconnectTried.current = true;
      setAutoConnecting(true);
      fetch("/api/integrations/whatsapp/reconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
        .then((res) => (res.ok ? loadStatus() : null))
        .catch(() => null)
        .finally(() => setAutoConnecting(false));
    });
  }, [loadStatus, userId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/integrations/whatsapp/mcp?uid=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          result?: { tools?: WaMcpTool[] };
          error?: { message?: string };
        } | null;
        if (!active) return;
        if (!res.ok || !body?.result) {
          setToolsError(body?.error?.message ?? "Could not load MCP tools.");
        } else {
          setTools(body.result.tools ?? []);
        }
      })
      .catch(() => {
        if (active) setToolsError("Could not reach the server. Please retry.");
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  const postAction = async (action: "reconnect" | "disconnect") => {
    setBusy(action);
    setActionError(null);
    try {
      const res = await fetch(`/api/integrations/whatsapp/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Could not ${action}. Please retry.`);
      }
      if (action === "disconnect") {
        onDisconnected();
        return;
      }
      await loadStatus();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : `Could not ${action}. Please retry.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const sessionActive = status?.connection === "open";

  return (
    <div className="space-y-5">
      <Card
        title="Connection"
        action={
          status?.linked ? (
            <div className="flex gap-2">
              {!sessionActive && (
                <button
                  type="button"
                  onClick={() => void postAction("reconnect")}
                  disabled={busy !== null || autoConnecting}
                  className={secondaryButtonClass}
                >
                  {busy === "reconnect" || autoConnecting
                    ? "Reconnecting…"
                    : "Reconnect"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void postAction("disconnect")}
                disabled={busy !== null}
                className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-500 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
              >
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          ) : undefined
        }
      >
        {statusError ? (
          <p className="text-sm text-rose-500">{statusError}</p>
        ) : !status ? (
          <div className="skeleton h-12 rounded-lg" />
        ) : (
          <div className="flex flex-wrap gap-x-12 gap-y-4">
            <Stat
              label="Phone number"
              value={
                status.phone ? (
                  <>
                    {status.phone}
                    {countryFromPhone(status.phone) && (
                      <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        ({countryFromPhone(status.phone)})
                      </span>
                    )}
                  </>
                ) : (
                  "—"
                )
              }
            />
            <Stat
              label="Connection status"
              value={
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${status.linked ? "text-emerald-500" : "text-zinc-500 dark:text-zinc-400"}`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${status.linked ? "animate-pulse bg-emerald-500" : "bg-zinc-400"}`}
                  />
                  {status.linked ? "Connected" : "Disconnected"}
                </span>
              }
            />
            <Stat
              label="Session active"
              value={
                sessionActive ? "Yes" : autoConnecting ? "Connecting…" : "No"
              }
            />
          </div>
        )}
        {actionError && <p className="mt-3 text-sm text-rose-500">{actionError}</p>}
      </Card>

      <Card
        title="Available MCP tools"
        subtitle="Run any tool live against your linked WhatsApp account."
      >
        {toolsError ? (
          <div>
            <p className="text-sm text-rose-500">{toolsError}</p>
            <button
              type="button"
              onClick={() => {
                setTools(null);
                setToolsError(null);
                setAttempt((n) => n + 1);
              }}
              className={`mt-3 ${secondaryButtonClass}`}
            >
              Retry
            </button>
          </div>
        ) : !tools ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="skeleton h-14 rounded-xl" />
            <div className="skeleton h-14 rounded-xl" />
            <div className="skeleton h-14 rounded-xl" />
            <div className="skeleton h-14 rounded-xl" />
          </div>
        ) : tools.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No MCP tools available.
          </p>
        ) : (
          <ul className="grid items-start gap-3 lg:grid-cols-2">
            {tools.map((tool) => (
              <WhatsappToolRunner
                key={tool.name}
                tool={tool}
                userId={userId}
                expanded={openTool === tool.name}
                onToggle={() =>
                  setOpenTool((current) =>
                    current === tool.name ? null : tool.name,
                  )
                }
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
