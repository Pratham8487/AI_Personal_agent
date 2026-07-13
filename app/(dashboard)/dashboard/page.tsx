"use client";

import {
  Alert02Icon,
  Clock01Icon,
  Flag02Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import Card from "@/components/dashboard/card";
import ConnectedAppsCard from "@/components/dashboard/connected-apps-card";
import GmailConnectCard from "@/components/dashboard/gmail-connect-card";
import PageHeader from "@/components/dashboard/page-header";
import PriorityItemsCard from "@/components/dashboard/priority-items-card";
import StatCard from "@/components/dashboard/stat-card";
import Toast from "@/components/dashboard/toast";
import TodaysBriefCard from "@/components/dashboard/todays-brief-card";
import { userDisplayName } from "@/lib/auth";
import { STATUS_CONNECTED } from "@/lib/integrations";
import { useCurrentUser } from "@/lib/use-current-user";
import { useDashboardData } from "@/lib/use-dashboard-brief";
import { useIntegrations } from "@/lib/use-integrations";
import { useGreeting, useToday } from "@/lib/use-today";

export default function DashboardPage() {
  const { user, isLoaded } = useCurrentUser();
  const { statuses, isLoading } = useIntegrations(user?.id);
  const today = useToday();
  const greeting = useGreeting();
  const gmailConnected = statuses.gmail?.status === STATUS_CONNECTED;
  const whatsappConnected = statuses.whatsapp?.status === STATUS_CONNECTED;
  const hasLiveSource = gmailConnected || whatsappConnected;
  const gatesLoading = !isLoaded || Boolean(user && isLoading);
  const brief = useDashboardData(user?.id, Boolean(user) && hasLiveSource);

  const briefLoading =
    gatesLoading || (Boolean(user) && hasLiveSource && brief.status === "loading");
  const data = brief.data;
  const refreshQuota = data?.refresh;
  const limitReached = Boolean(refreshQuota && refreshQuota.remaining <= 0);

  // null → still loading (skeleton tile); "—" → no live data available.
  const statValue = (value: number | undefined): string | null => {
    if (briefLoading) return null;
    return value === undefined ? "—" : value.toLocaleString("en-US");
  };

  const stats = [
    {
      label: "Important",
      value: statValue(data?.importantCount),
      icon: Alert02Icon,
      iconBg: "bg-rose-500 shadow-rose-500/40",
      description: "Items requiring immediate attention.",
    },
    {
      label: "Priority",
      value: statValue(data?.priorityCount),
      icon: Flag02Icon,
      iconBg: "bg-indigo-500 shadow-indigo-500/40",
      description: "AI prioritized tasks.",
    },
    {
      label: "Follow-ups",
      value: statValue(data?.followUpCount),
      icon: Clock01Icon,
      iconBg: "bg-amber-500 shadow-amber-500/40",
      description: "Pending replies and reminders.",
    },
  ];

  return (
    <>
      <PageHeader
        title={user ? `👋 Welcome, ${userDisplayName(user)}` : "Dashboard"}
        description={
          [greeting, today].filter(Boolean).join(" · ") ||
          "Your day across every inbox, in one brief."
        }
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

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) =>
          stat.value === null ? (
            <div key={stat.label} className="skeleton h-28 rounded-3xl" />
          ) : (
            <StatCard key={stat.label} {...stat} value={stat.value} />
          ),
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {isLoaded && !user ? (
          <GmailConnectCard variant="sign-in" className="xl:col-span-2" />
        ) : (
          <>
            {/* Each card paints as soon as its own data is ready. */}
            {gatesLoading ? (
              <div className="skeleton h-40 rounded-3xl xl:col-span-2" />
            ) : hasLiveSource ? (
              <TodaysBriefCard
                className="xl:col-span-2"
                status={brief.status}
                entries={brief.data?.brief ?? []}
                error={brief.error}
                notConfigured={brief.notConfigured}
                onRetry={brief.retry}
                subtitle={
                  brief.data?.degraded
                    ? "AI unavailable — showing basics"
                    : "AI generated summary from your connected apps."
                }
              />
            ) : (
              <Card
                title="Today's Brief"
                subtitle="Connect an app to get started"
                className="text-center xl:col-span-2"
              >
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Connect Gmail or WhatsApp to get an AI-generated brief of
                  your day.
                </p>
                <Link
                  href="/integrations"
                  className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
                >
                  Go to integrations
                </Link>
              </Card>
            )}
            <ConnectedAppsCard
              statuses={statuses}
              isLoading={!isLoaded || isLoading}
            />
            {gatesLoading ? (
              <div className="skeleton h-56 rounded-3xl" />
            ) : hasLiveSource ? (
              <PriorityItemsCard
                status={brief.status}
                items={brief.data?.priorityItems ?? []}
                error={brief.error}
                notConfigured={brief.notConfigured}
                onRetry={brief.retry}
              />
            ) : (
              <Card title="Priority Items" subtitle="What needs you first">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Priority items appear here once an app is connected.
                </p>
              </Card>
            )}
          </>
        )}
      </div>

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
