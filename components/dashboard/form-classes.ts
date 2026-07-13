/**
 * Shared form styling for dialogs and inline forms (same look as
 * whatsapp-pair-dialog.tsx, which keeps its own local copies).
 */

// color-scheme keeps native popups (select options, time/date pickers)
// matching the page theme instead of always rendering light.
export const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 [color-scheme:light] dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500 dark:[color-scheme:dark]";

export const primaryButtonClass =
  "rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85 disabled:opacity-50";

export const secondaryButtonClass =
  "rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5";

export const labelClass =
  "mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300";
