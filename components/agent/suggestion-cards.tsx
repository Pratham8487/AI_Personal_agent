"use client";

import AppIcon from "@/components/dashboard/app-icon";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type Suggestion = {
  title: string;
  /** The prompt actually sent; defaults to the title. */
  prompt?: string;
  /** Provider id whose logo fronts the card, when app-specific. */
  app?: string;
};

/**
 * Starter prompt cards for an empty chat. Cards (rather than chips) give each
 * idea a logo and enough room to read as a suggestion rather than a tag.
 */
export default function SuggestionCards({
  items,
  onSelect,
  disabled = false,
}: {
  items: Suggestion[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <button
          key={item.title}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(item.prompt ?? item.title)}
          className="group flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white/50 px-3.5 py-3 text-left text-sm text-zinc-700 transition-colors hover:border-violet-400/60 hover:bg-violet-50/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/10"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-white/[0.06]">
            {item.app ? (
              <AppIcon app={item.app} className="h-4 w-4" />
            ) : (
              <HugeiconsIcon
                icon={SparklesIcon}
                size={15}
                strokeWidth={1.8}
                className="text-violet-500"
              />
            )}
          </span>
          <span className="min-w-0">{item.title}</span>
        </button>
      ))}
    </div>
  );
}
