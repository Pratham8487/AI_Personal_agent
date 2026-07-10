"use client";

import Badge, { type BadgeTone } from "./badge";
import type { EmailSummary } from "@/lib/gmail-mcp-client";
import type { GmailDataStatus } from "@/lib/use-gmail-data";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** Gmail snippets arrive HTML-escaped. */
function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** `"Ann Lee" <ann@x.com>` → `Ann Lee`; falls back to the address. */
function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*(?:<[^>]*>)?\s*$/);
  const name = match?.[1]?.trim();
  return name || from.replace(/[<>]/g, "").trim() || "Unknown sender";
}

function formatAge(dateHeader: string): { label: string; tone: BadgeTone } | null {
  const date = new Date(dateHeader);
  if (Number.isNaN(date.getTime())) return null;
  const tone: BadgeTone =
    date.toDateString() === new Date().toDateString() ? "amber" : "zinc";
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return { label: `${minutes}m ago`, tone };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { label: `${hours}h ago`, tone };
  return { label: `${Math.round(hours / 24)}d ago`, tone };
}

/** Renders the loading / error / empty / ready states of a Gmail email list. */
export default function GmailEmailList({
  status,
  emails,
  error,
  onRetry,
  emptyText = "No emails found.",
  badgeLabel,
}: {
  status: GmailDataStatus;
  emails: EmailSummary[];
  error: string | null;
  onRetry: () => void;
  emptyText?: string;
  badgeLabel?: string;
}) {
  if (status === "error") {
    return (
      <div>
        <p className="text-sm text-rose-500">
          {error ?? "Could not load Gmail data."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          Retry
        </button>
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <div className="space-y-2">
        <div className="skeleton h-12 rounded-xl" />
        <div className="skeleton h-12 rounded-xl" />
        <div className="skeleton h-12 rounded-xl" />
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>
    );
  }

  return (
    <ul className="space-y-4">
      {emails.map((email, index) => {
        const age = formatAge(email.date);
        return (
          <li
            key={`${email.date}-${email.subject}-${index}`}
            className="flex items-start justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Gmail · {senderName(email.from)}
              </p>
              <p className="mt-0.5 truncate text-sm text-zinc-700 dark:text-zinc-200">
                {email.subject || decodeEntities(email.snippet) || "(no subject)"}
              </p>
            </div>
            {badgeLabel ? (
              <Badge tone="amber">{badgeLabel}</Badge>
            ) : (
              age && <Badge tone={age.tone}>{age.label}</Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}
