"use client";

import { Brain02Icon, PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import AppIcon from "./app-icon";
import Card from "./card";
import type { BriefEntry } from "@/lib/dashboard-brief-types";
import type { BriefStatus } from "@/lib/use-dashboard-brief";

function BriefSection({
  icon,
  name,
  entries,
}: {
  icon: React.ReactNode;
  name: string;
  entries: BriefEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-semibold tracking-wide text-zinc-700 uppercase dark:text-zinc-300">
          {name}
        </h3>
      </div>
      <ul className="mt-2 space-y-2">
        {entries.map((entry, index) => (
          <li key={index} className="flex items-start gap-2.5 pl-6">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-blue-500" />
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
              {entry.text}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** AI-generated summary of today across the user's connected apps. */
function TodaysBriefCard({
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
    <Card
      title="Today's Brief"
      subtitle={subtitle}
      icon={
        <HugeiconsIcon
          icon={Brain02Icon}
          size={16}
          strokeWidth={1.8}
          className="text-violet-500 dark:text-violet-400"
        />
      }
      className={className}
    >
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
        <div className="space-y-5">
          <BriefSection
            icon={<AppIcon app="gmail" />}
            name="Gmail"
            entries={entries.filter((entry) => entry.apps.includes("gmail"))}
          />
          <BriefSection
            icon={<AppIcon app="whatsapp" />}
            name="WhatsApp"
            entries={entries.filter((entry) => entry.apps.includes("whatsapp"))}
          />
          <BriefSection
            icon={
              <HugeiconsIcon
                icon={PinIcon}
                size={16}
                strokeWidth={1.8}
                className="text-violet-500 dark:text-violet-400"
              />
            }
            name="Today's Focus"
            entries={entries.filter((entry) => entry.apps.length === 0)}
          />
        </div>
      )}
    </Card>
  );
}

export default memo(TodaysBriefCard);
