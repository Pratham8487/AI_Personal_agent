"use client";

import {
  Delete02Icon,
  PencilEdit02Icon,
  PlusSignIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useState } from "react";
import AppIcon from "@/components/dashboard/app-icon";
import Badge, { type BadgeTone } from "@/components/dashboard/badge";
import Card from "@/components/dashboard/card";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/dashboard/form-classes";
import type { BriefingDefinition } from "@/lib/briefing-types";
import type { PriorityLevel } from "@/lib/dashboard-brief-types";
import type { BriefingsStatus } from "@/lib/use-briefings";

const PRIORITY_TONES: Record<PriorityLevel, BadgeTone> = {
  high: "rose",
  medium: "amber",
  low: "green",
};

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  once: "One-time",
};

function BriefingRow({
  config,
  isGenerating,
  quotaExhausted,
  onEdit,
  onDelete,
  onGenerateNow,
}: {
  config: BriefingDefinition;
  isGenerating: boolean;
  quotaExhausted: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onGenerateNow: () => void;
}) {
  // Inline two-step delete: first click arms, second confirms.
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
            {config.name}
          </p>
          {config.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
              {config.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone="zinc">
            {FREQUENCY_LABELS[config.frequency] ?? config.frequency}
            {config.frequency !== "once" ? ` · ${config.scheduleTime}` : ""}
          </Badge>
          <Badge tone={PRIORITY_TONES[config.priority]}>{config.priority}</Badge>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {(config.apps.length > 0 ? config.apps : ["gmail", "whatsapp"]).map(
            (app) => (
              <span
                key={app}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900"
              >
                <AppIcon app={app} className="h-3.5 w-3.5" />
              </span>
            ),
          )}
          {!config.enabled && <Badge tone="zinc">Paused</Badge>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onGenerateNow}
            disabled={isGenerating || quotaExhausted}
            title={
              quotaExhausted
                ? "You've reached today's generation limit."
                : undefined
            }
            className={`flex items-center gap-1.5 ${secondaryButtonClass}`}
          >
            <HugeiconsIcon
              icon={SparklesIcon}
              size={12}
              strokeWidth={1.8}
              className={isGenerating ? "animate-spin" : ""}
            />
            {isGenerating ? "Generating…" : "Generate now"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${config.name}`}
            className={secondaryButtonClass}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} size={12} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              setConfirming(false);
              onDelete();
            }}
            onBlur={() => setConfirming(false)}
            aria-label={`Delete ${config.name}`}
            className={
              confirming
                ? "rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400"
                : secondaryButtonClass
            }
          >
            {confirming ? (
              "Confirm?"
            ) : (
              <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>
    </li>
  );
}

/** User-created briefings, generated automatically on their schedule. */
function CustomBriefingsCard({
  status,
  configs,
  error,
  onRetry,
  onCreate,
  onEdit,
  onDelete,
  onGenerateNow,
  generatingId,
  quotaExhausted,
  className = "",
}: {
  status: BriefingsStatus;
  configs: BriefingDefinition[];
  error: string | null;
  onRetry: () => void;
  onCreate: () => void;
  onEdit: (config: BriefingDefinition) => void;
  onDelete: (briefingId: string) => void;
  onGenerateNow: (briefingId: string) => void;
  generatingId: string | null;
  quotaExhausted: boolean;
  className?: string;
}) {
  const custom = configs.filter((c) => !c.isDefault);
  return (
    <Card
      title="Your briefings"
      subtitle="Auto-generated on your schedule"
      action={
        <button
          type="button"
          onClick={onCreate}
          className={`flex items-center gap-1.5 ${secondaryButtonClass}`}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
          New
        </button>
      }
      className={className}
    >
      {status === "error" ? (
        <div>
          <p className="text-sm text-rose-500">
            {error ?? "Could not load your briefings."}
          </p>
          <button type="button" onClick={onRetry} className={`mt-3 ${secondaryButtonClass}`}>
            Retry
          </button>
        </div>
      ) : status !== "ready" ? (
        <div className="space-y-2">
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-20 rounded-xl" />
        </div>
      ) : custom.length === 0 ? (
        <div className="text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Create a custom briefing for a specific goal — a client, a project,
            a channel — and it runs automatically.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className={`mt-4 ${primaryButtonClass}`}
          >
            Create your first briefing
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {custom.map((config) => (
            <BriefingRow
              key={config.id}
              config={config}
              isGenerating={generatingId === config.id}
              quotaExhausted={quotaExhausted}
              onEdit={() => onEdit(config)}
              onDelete={() => onDelete(config.id)}
              onGenerateNow={() => onGenerateNow(config.id)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

export default memo(CustomBriefingsCard);
