"use client";

import Link from "next/link";
import { memo } from "react";
import Badge from "@/components/dashboard/badge";
import Card from "@/components/dashboard/card";
import { secondaryButtonClass } from "@/components/dashboard/form-classes";
import type { GeneratedBriefingSummary } from "@/lib/briefing-types";
import type { BriefingsStatus } from "@/lib/use-briefings";
import { dateTimeLabel } from "./format";

const MAX_ROWS = 10;

/** Past generated briefings; each row opens its detail page. */
function HistoryCard({
  status,
  items,
  error,
  onRetry,
  className = "",
}: {
  status: BriefingsStatus;
  items: GeneratedBriefingSummary[];
  error: string | null;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Card
      title="Past briefings"
      subtitle="Recently generated"
      className={className}
    >
      {status === "error" ? (
        <div>
          <p className="text-sm text-rose-500">
            {error ?? "Could not load past briefings."}
          </p>
          <button type="button" onClick={onRetry} className={`mt-3 ${secondaryButtonClass}`}>
            Retry
          </button>
        </div>
      ) : status !== "ready" ? (
        <div className="space-y-2">
          <div className="skeleton h-12 rounded-xl" />
          <div className="skeleton h-12 rounded-xl" />
          <div className="skeleton h-12 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Generated briefings will appear here each morning.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, MAX_ROWS).map((item) => (
            <li key={item.id}>
              <Link
                href={`/briefing/${item.id}`}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-100 dark:hover:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {dateTimeLabel(item.generatedAt)} · {item.totalCount}{" "}
                    {item.totalCount === 1 ? "item" : "items"}
                  </p>
                </div>
                <Badge tone={item.isDefault ? "indigo" : "zinc"}>
                  {item.isDefault ? "Daily" : "Custom"}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default memo(HistoryCard);
