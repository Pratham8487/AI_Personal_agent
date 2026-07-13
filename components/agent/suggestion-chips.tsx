"use client";

/** Clickable prompt chips: initial ideas and post-answer quick replies. */
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
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item) => (
        <button
          key={item}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(item)}
          className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          {item}
        </button>
      ))}
    </div>
  );
}
