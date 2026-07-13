"use client";

import { MailReply01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import AppIcon from "@/components/dashboard/app-icon";
import Badge, { type BadgeTone } from "@/components/dashboard/badge";
import { secondaryButtonClass } from "@/components/dashboard/form-classes";
import type { BriefingItem } from "@/lib/briefing-types";
import type { PriorityLevel } from "@/lib/dashboard-brief-types";
import { PROVIDERS } from "@/lib/integrations";
import { shortTime } from "./format";

const PRIORITY_TONES: Record<PriorityLevel, BadgeTone> = {
  high: "rose",
  medium: "amber",
  low: "green",
};

const APP_NAMES = new Map(PROVIDERS.map((p) => [p.id as string, p.name]));

/** Briefing items; a row expands in place with actions (open, compose). */
function BriefingItemList({
  items,
  selectedId,
  onSelect,
  onCompose,
  emptyText,
}: {
  items: BriefingItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCompose: (item: BriefingItem) => void;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const expanded = selectedId === item.id;
        const composeLabel =
          item.source === "gmail" ? "Reply by email" : "Send message";
        return (
          <li
            key={item.id}
            className={`rounded-xl border transition-colors ${
              expanded
                ? "border-violet-500/40 bg-violet-500/5"
                : "border-zinc-200 dark:border-white/10"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(expanded ? null : item.id)}
              aria-expanded={expanded}
              className="flex w-full items-start gap-3 p-3 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900">
                <AppIcon app={item.source} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                    {item.title}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                    {APP_NAMES.get(item.source) ?? item.source}
                    {shortTime(item.timestamp)
                      ? ` · ${shortTime(item.timestamp)}`
                      : ""}
                  </span>
                </span>
                {item.description && (
                  <span
                    className={`mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400 ${
                      expanded ? "" : "line-clamp-2"
                    }`}
                  >
                    {item.description}
                  </span>
                )}
              </span>
              <Badge tone={PRIORITY_TONES[item.priority]}>{item.priority}</Badge>
            </button>
            {expanded && (
              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-3 py-2.5 dark:border-white/10">
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={secondaryButtonClass}
                  >
                    Open in {APP_NAMES.get(item.source) ?? item.source}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onCompose(item)}
                  className={`flex items-center gap-1.5 ${secondaryButtonClass}`}
                >
                  <HugeiconsIcon
                    icon={item.source === "gmail" ? MailReply01Icon : SentIcon}
                    size={12}
                    strokeWidth={1.8}
                  />
                  {composeLabel}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default memo(BriefingItemList);
