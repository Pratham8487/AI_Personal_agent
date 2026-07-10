"use client";

import AppIcon from "./app-icon";
import Card from "./card";
import type { BriefEntry } from "@/lib/dashboard-brief-types";
import type { BriefStatus } from "@/lib/use-dashboard-brief";

/** AI-generated summary of today across the user's connected apps. */
export default function TodaysBriefCard({
  status,
  entries,
  error,
  notConfigured,
  onRetry,
  subtitle,
  className = "",
}: {
  status: BriefStatus;
  entries: BriefEntry[];
  error: string | null;
  notConfigured: boolean;
  onRetry: () => void;
  subtitle: string;
  className?: string;
}) {
  return (
    <Card title="Today's Brief" subtitle={subtitle} className={className}>
      {status === "error" ? (
        <div>
          <p className="text-sm text-rose-500">
            {error ?? "Could not load your brief."}
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
          <div className="skeleton h-10 rounded-xl" />
          <div className="skeleton h-10 rounded-xl" />
          <div className="skeleton h-10 rounded-xl" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nothing notable yet today.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-blue-500" />
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                {entry.text}
              </p>
              {entry.apps.length > 0 && (
                <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
                  {entry.apps.map((app) => (
                    <AppIcon key={app} app={app} />
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
