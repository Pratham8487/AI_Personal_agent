"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/**
 * Post-answer quick replies. Keyed by index rather than text: the model can
 * return the same prompt twice, which would collide as a React key.
 */
export default function SuggestionChips({
  items,
  onSelect,
  disabled = false,
  className = "",
}: {
  items: string[];
  onSelect: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`}
      aria-label="Suggested replies"
    >
      {items.map((item, index) => (
        <button
          key={`${index}-${item}`}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(item)}
          className="group flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-violet-400/60 hover:bg-violet-50/60 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
        >
          {item}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={13}
            strokeWidth={2}
            className="opacity-0 transition-opacity group-hover:opacity-70"
          />
        </button>
      ))}
    </div>
  );
}
