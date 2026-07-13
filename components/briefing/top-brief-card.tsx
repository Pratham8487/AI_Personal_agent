"use client";

import { AiBrainIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { memo } from "react";
import Badge from "@/components/dashboard/badge";
import Card from "@/components/dashboard/card";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/dashboard/form-classes";
import type { GeneratedBriefing } from "@/lib/briefing-types";
import type { BriefingsStatus } from "@/lib/use-briefings";
import { dateTimeLabel } from "./format";

/** Highlighted hero: the latest automatic daily briefing. */
function TopBriefCard({
  status,
  briefing,
  error,
  onRetry,
  onGenerate,
  isGenerating,
  quotaRemaining,
  className = "",
}: {
  status: BriefingsStatus;
  briefing: GeneratedBriefing | null;
  error: string | null;
  onRetry: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  quotaRemaining?: number;
  className?: string;
}) {
  const quotaExhausted = quotaRemaining !== undefined && quotaRemaining <= 0;
  return (
    <Card
      title="Today's Briefing"
      icon={
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 text-white">
          <HugeiconsIcon icon={AiBrainIcon} size={14} strokeWidth={1.8} />
        </span>
      }
      subtitle={
        briefing
          ? `Auto-generated every morning · ${dateTimeLabel(briefing.generatedAt)}`
          : "Auto-generated every morning"
      }
      action={<Badge tone="indigo">AI Generated</Badge>}
      className={`ring-1 ring-violet-500/25 bg-gradient-to-br from-violet-500/10 to-blue-500/5 dark:from-violet-500/10 dark:to-blue-500/5 ${className}`}
    >
      {status === "error" ? (
        <div>
          <p className="text-sm text-rose-500">
            {error ?? "Could not load your briefing."}
          </p>
          <button type="button" onClick={onRetry} className={`mt-3 ${secondaryButtonClass}`}>
            Retry
          </button>
        </div>
      ) : status !== "ready" ? (
        <div className="space-y-2">
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-2/3 rounded" />
        </div>
      ) : !briefing ? (
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Your first daily briefing hasn&apos;t been generated yet. It runs
            automatically each morning — or generate one now.
          </p>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating || quotaExhausted}
            title={
              quotaExhausted
                ? "You've reached today's generation limit. Try again later."
                : undefined
            }
            className={`mt-4 flex items-center gap-2 ${primaryButtonClass}`}
          >
            <HugeiconsIcon
              icon={SparklesIcon}
              size={14}
              strokeWidth={1.8}
              className={isGenerating ? "animate-spin" : ""}
            />
            {isGenerating ? "Generating…" : "Generate now"}
          </button>
        </div>
      ) : (
        <div>
          {briefing.degraded && (
            <p className="mb-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              AI unavailable — showing basics.
            </p>
          )}
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
            {briefing.topSummary}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/briefing/${briefing.id}`}
              className="text-xs font-semibold text-violet-600 hover:underline dark:text-violet-400"
            >
              View full briefing →
            </Link>
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerating || quotaExhausted}
              title={
                quotaExhausted
                  ? "You've reached today's generation limit. Try again later."
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
              {isGenerating
                ? "Generating…"
                : quotaRemaining !== undefined
                  ? `Generate now (${quotaRemaining} left)`
                  : "Generate now"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default memo(TopBriefCard);
