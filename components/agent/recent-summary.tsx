"use client";

import { ArrowDown01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useState } from "react";
import AppIcon from "@/components/dashboard/app-icon";
import Card from "@/components/dashboard/card";
import { useDashboardData } from "@/lib/use-dashboard-brief";

/** Compact strip of the latest AI brief entries, reused from the dashboard. */
export default function RecentSummary({
  userId,
  enabled,
}: {
  userId: string | undefined;
  enabled: boolean;
}) {
  const brief = useDashboardData(userId, enabled && Boolean(userId));
  const entries = brief.data?.brief.slice(0, 4) ?? [];
  // Collapsible so the chat card below — which is flex-1 — can take the space.
  const [open, setOpen] = useState(true);

  return (
    <Card
      title="Recent summary"
      subtitle="The latest important updates from your connected apps."
      icon={
        <HugeiconsIcon
          icon={SparklesIcon}
          size={16}
          strokeWidth={1.8}
          className="text-violet-500"
        />
      }
      action={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="recent-summary-body"
          aria-label={open ? "Collapse recent summary" : "Expand recent summary"}
          className="-m-1.5 shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-200"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={16}
            strokeWidth={2}
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      }
      className="mb-6 shrink-0"
    >
      {/* -mt-5 cancels the card header's mb-5 so collapsing leaves no gap. */}
      <div
        id="recent-summary-body"
        className={`grid transition-all duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "-mt-5 grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden" inert={!open}>
          {!enabled ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Connect Gmail or WhatsApp on the{" "}
              <Link
                href="/integrations"
                className="font-medium text-violet-600 underline underline-offset-2 dark:text-violet-400"
              >
                Integrations
              </Link>{" "}
              page to see live updates here.
            </p>
          ) : brief.status === "loading" || brief.status === "idle" ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((row) => (
                <div key={row} className="skeleton h-4 w-full max-w-xl rounded" />
              ))}
            </div>
          ) : brief.status === "error" ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Could not load your summary.{" "}
              <button
                type="button"
                onClick={brief.retry}
                className="font-medium text-violet-600 underline underline-offset-2 dark:text-violet-400"
              >
                Retry
              </button>
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nothing important right now — you&apos;re all caught up.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {entries.map((entry, index) => (
                <li key={index} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex shrink-0 items-center gap-1">
                    {entry.apps.length > 0 ? (
                      entry.apps.map((app) => (
                        <AppIcon key={app} app={app} className="h-4 w-4" />
                      ))
                    ) : (
                      <HugeiconsIcon
                        icon={SparklesIcon}
                        size={16}
                        strokeWidth={1.8}
                        className="text-violet-500"
                      />
                    )}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {entry.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
