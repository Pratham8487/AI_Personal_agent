"use client";

import Badge from "./badge";
import Card from "./card";
import { STATUS_CONNECTED, type Provider } from "@/lib/integrations";

const outlineButton =
  "flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5";

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
    <Card hover className="flex flex-col text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900">
        <provider.Icon className={`h-6 w-6 ${provider.brandClass}`} />
      </span>
      <div className="mt-3 flex items-center justify-center gap-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          {provider.name}
        </p>
        {connected && <Badge tone="green">Connected</Badge>}
      </div>
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
            <button
              type="button"
              onClick={onOpenSettings}
              className={outlineButton}
            >
              Settings
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={pending}
            className="w-full rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            {pending ? "Connecting…" : "Connect"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
    </Card>
  );
}
