"use client";

import Card from "./card";
import { STATUS_CONNECTED, type Provider } from "@/lib/integrations";

const outlineButton =
  "flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5";

function StatusBadge({ connected }: { connected: boolean }) {
  if (!connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300/60 bg-zinc-100/80 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
        Disconnected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/50 bg-gradient-to-r from-emerald-500/15 to-teal-500/15 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-emerald-700 shadow-[0_0_14px_rgba(16,185,129,0.35)] dark:border-emerald-400/30 dark:text-emerald-300">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 dark:bg-emerald-400" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
      </span>
      Connected
    </span>
  );
}

export default function IntegrationCard({
  provider,
  status,
  pending,
  error,
  onConnect,
  onDisconnect,
  onOpenSettings,
}: {
  provider: Provider;
  status: string | undefined;
  pending: boolean;
  error: string | null | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenSettings: () => void;
}) {
  const connected = status === STATUS_CONNECTED;

  return (
    <Card
      hover
      className={`relative flex flex-col text-center ${
        connected ? "glass-connected" : ""
      }`}
    >
      <span className="absolute top-4 right-4">
        <StatusBadge connected={connected} />
      </span>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900">
        <provider.Icon className={`h-6 w-6 ${provider.brandClass}`} />
      </span>
      <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white">
        {provider.name}
      </p>
      <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        {provider.description}
      </p>
      <div className="mt-4 flex gap-2">
        {connected ? (
          <>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={pending}
              className={outlineButton}
            >
              {pending ? "Disconnecting…" : "Disconnect"}
            </button>
            {provider.hasLiveTools && (
              <button
                type="button"
                onClick={onOpenSettings}
                className={outlineButton}
              >
                Settings
              </button>
            )}
          </>
        ) : provider.hasLiveTools ? (
          <button
            type="button"
            onClick={onConnect}
            disabled={pending}
            className="w-full rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            {pending ? "Connecting…" : "Connect"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-400 dark:border-white/10 dark:text-zinc-500"
          >
            Coming Soon
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
    </Card>
  );
}
