"use client";

import AppIcon from "@/components/dashboard/app-icon";
import type { AgentToolRun } from "@/lib/use-agent-chat";
import { PROVIDERS } from "@/lib/integrations";
import { Alert02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const providerName = new Map<string, string>(
  PROVIDERS.map((p) => [p.id, p.name]),
);

/**
 * Live checklist of the tool calls backing the answer in progress, so
 * "thinking" reads as concrete work — which app, which lookup, and whether
 * it succeeded.
 */
export default function ToolTrace({ runs }: { runs: AgentToolRun[] }) {
  if (runs.length === 0) return null;
  return (
    <ul className="space-y-1.5" aria-label="Fetching data">
      {runs.map((run) => (
        <li
          key={run.id}
          className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400"
        >
          <AppIcon app={run.app} className="h-3.5 w-3.5 shrink-0" />
          <span className={run.done && !run.ok ? "line-through" : ""}>
            {providerName.get(run.app) ?? run.app}
            <span className="text-zinc-400 dark:text-zinc-500">
              {" · "}
              {run.label}
            </span>
          </span>
          {!run.done ? (
            <span
              className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-violet-500/30 border-t-violet-500"
              aria-hidden
            />
          ) : run.ok ? (
            <HugeiconsIcon
              icon={Tick02Icon}
              size={13}
              strokeWidth={2.5}
              className="shrink-0 text-emerald-500"
            />
          ) : (
            <HugeiconsIcon
              icon={Alert02Icon}
              size={13}
              strokeWidth={2.5}
              className="shrink-0 text-amber-500"
            />
          )}
        </li>
      ))}
    </ul>
  );
}
