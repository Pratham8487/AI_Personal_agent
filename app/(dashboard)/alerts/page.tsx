"use client";

import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import Card from "@/components/dashboard/card";
import PageHeader from "@/components/dashboard/page-header";
import PriorityItemsCard from "@/components/dashboard/priority-items-card";
import Toast from "@/components/dashboard/toast";
import { STATUS_CONNECTED } from "@/lib/integrations";
import { useCurrentUser } from "@/lib/use-current-user";
import { useDashboardData } from "@/lib/use-dashboard-brief";
import { useIntegrations } from "@/lib/use-integrations";

/**
 * Alerts are the prioritized items the dashboard pipeline already derives from
 * the user's connected apps — same cache, same refresh quota, no extra AI call.
 */
export default function AlertsPage() {
  const { user, isLoaded } = useCurrentUser();
  const { statuses, isLoading } = useIntegrations(user?.id);
  // Mirrors the dashboard's gate so both pages agree on when there is data.
  const hasLiveSource =
    statuses.gmail?.status === STATUS_CONNECTED ||
    statuses.whatsapp?.status === STATUS_CONNECTED;
  const gatesLoading = !isLoaded || Boolean(user && isLoading);
  const brief = useDashboardData(user?.id, Boolean(user) && hasLiveSource);

  const data = brief.data;
  const refreshQuota = data?.refresh;
  const limitReached = Boolean(refreshQuota && refreshQuota.remaining <= 0);

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Aster alerts you when pricing, payment, or urgent issues appear."
        action={
          user && hasLiveSource ? (
            <button
              type="button"
              onClick={brief.regenerate}
              disabled={brief.isRegenerating || limitReached}
              title={
                limitReached
                  ? "You've reached today's AI refresh limit. Try again after 24 hours."
                  : undefined
              }
              className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              <HugeiconsIcon
                icon={RefreshIcon}
                size={14}
                strokeWidth={1.8}
                className={brief.isRegenerating ? "animate-spin" : ""}
              />
              {brief.isRegenerating
                ? "Refreshing…"
                : refreshQuota
                  ? `Refresh (${refreshQuota.remaining} left)`
                  : "Refresh"}
            </button>
          ) : undefined
        }
      />

      {data?.partial && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Partial data available — a connected app didn&apos;t respond. Refresh
          to retry.
        </div>
      )}

      {isLoaded && !user ? (
        <Card title="Alerts" subtitle="Sign in to see your alerts">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to see what needs your attention across your apps.
          </p>
        </Card>
      ) : gatesLoading ? (
        <div className="skeleton h-56 rounded-3xl" />
      ) : hasLiveSource ? (
        <PriorityItemsCard
          status={brief.status}
          items={data?.priorityItems ?? []}
          error={brief.error}
          notConfigured={brief.notConfigured}
          onRetry={brief.retry}
          title="Recent alerts"
          subtitle={
            data?.degraded
              ? "AI unavailable — showing basics"
              : "What Aster flagged across your connected apps"
          }
          emptyMessage="No alerts right now — nothing needs your attention."
        />
      ) : (
        <Card title="Recent alerts" subtitle="Connect an app to get started">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Connect Gmail or WhatsApp and Aster will flag urgent mail,
            deadlines, and payment mentions here.
          </p>
          <Link
            href="/integrations"
            className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
          >
            Go to integrations
          </Link>
        </Card>
      )}

      {data && (
        <p className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Last updated{" "}
          {new Date(data.lastUpdated).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}

      <Toast message={brief.limitNotice} />
    </>
  );
}
