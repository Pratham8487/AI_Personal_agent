"use client";

import { memo } from "react";
import AppIcon from "./app-icon";
import Badge, { type BadgeTone } from "./badge";
import Card from "./card";
import type { PriorityItem, PriorityLevel } from "@/lib/dashboard-brief-types";
import { PROVIDERS } from "@/lib/integrations";
import type { BriefStatus } from "@/lib/use-dashboard-brief";

const PRIORITY_TONES: Record<PriorityLevel, BadgeTone> = {
  high: "rose",
  medium: "amber",
  low: "green",
};

const APP_NAMES = new Map(PROVIDERS.map((p) => [p.id as string, p.name]));

/** Short human time, e.g. "9:41 AM" today, else "Jul 9". */
function shortTime(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** AI-ranked items that need the user first, with source app and urgency. */
function PriorityItemsCard({
  status,
  items,
  error,
  notConfigured,
  onRetry,
  className = "",
}: {
  status: BriefStatus;
  items: PriorityItem[];
  error: string | null;
  notConfigured: boolean;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Card
      title="Priority Items"
      subtitle="What needs you first"
      className={className}
    >
      {status === "error" ? (
        <div>
          <p className="text-sm text-rose-500">
            {error ?? "Could not load your priority items."}
          </p>
          {!notConfigured && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              Retry
            </button>
          )}
        </div>
      ) : status !== "ready" ? (
        <div className="space-y-2">
          <div className="skeleton h-14 rounded-xl" />
          <div className="skeleton h-14 rounded-xl" />
          <div className="skeleton h-14 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nothing urgent right now. Nice work!
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900">
                <AppIcon app={item.source} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  {item.link ? (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm font-semibold text-zinc-900 hover:underline dark:text-white"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                      {item.title}
                    </p>
                  )}
                  <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                    {APP_NAMES.get(item.source) ?? item.source}
                    {shortTime(item.timestamp)
                      ? ` · ${shortTime(item.timestamp)}`
                      : ""}
                  </span>
                </div>
                {item.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {item.description}
                  </p>
                )}
              </div>
              <Badge tone={PRIORITY_TONES[item.priority]}>
                {item.priority}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default memo(PriorityItemsCard);
