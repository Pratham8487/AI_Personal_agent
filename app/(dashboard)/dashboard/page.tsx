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
import TodaysBriefCard from "@/components/dashboard/todays-brief-card";
import { userDisplayName } from "@/lib/auth";
import { STATUS_CONNECTED } from "@/lib/integrations";
import { useCurrentUser } from "@/lib/use-current-user";
import { useDashboardBrief } from "@/lib/use-dashboard-brief";
import { useIntegrations } from "@/lib/use-integrations";
import { useToday } from "@/lib/use-today";

export default function DashboardPage() {
  const { user, isLoaded } = useCurrentUser();
  const { statuses, isLoading } = useIntegrations(user?.id);
  const today = useToday();
  const gmailConnected = statuses.gmail?.status === STATUS_CONNECTED;
  const whatsappConnected = statuses.whatsapp?.status === STATUS_CONNECTED;
  const hasLiveSource = gmailConnected || whatsappConnected;
  const gatesLoading = !isLoaded || Boolean(user && isLoading);
  const brief = useDashboardBrief(user?.id, Boolean(user) && hasLiveSource);

  const briefLoading =
    gatesLoading || (Boolean(user) && hasLiveSource && brief.status === "loading");
  const counts = brief.data?.counts;

  // null → still loading (skeleton tile); "—" → no live data available.
  const statValue = (value: number | undefined): string | null => {
    if (briefLoading) return null;
    return value === undefined ? "—" : value.toLocaleString("en-US");
  };

  const stats = [
    {
      label: "Important",
      value: statValue(counts?.important),
      icon: Alert02Icon,
      iconBg: "bg-rose-500 shadow-rose-500/40",
    },
    {
      label: "Priority",
      value: statValue(counts?.priority),
      icon: Flag02Icon,
      iconBg: "bg-indigo-500 shadow-indigo-500/40",
    },
    {
      label: "Follow-ups",
      value: statValue(counts?.followUps),
      icon: Clock01Icon,
      iconBg: "bg-amber-500 shadow-amber-500/40",
    },
  ];

  return (
    <>
      <PageHeader
        title={user ? `Welcome back, ${userDisplayName(user)}` : "Dashboard"}
        description={today ?? "Your day across every inbox, in one brief."}
        action={
          user && hasLiveSource ? (
            <button
              type="button"
              onClick={brief.regenerate}
              disabled={brief.isRegenerating}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              <HugeiconsIcon
                icon={RefreshIcon}
                size={14}
                strokeWidth={1.8}
                className={brief.isRegenerating ? "animate-spin" : ""}
              />
              {brief.isRegenerating ? "Refreshing…" : "Refresh"}
            </button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) =>
          stat.value === null ? (
            <div key={stat.label} className="skeleton h-24 rounded-3xl" />
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
                    : brief.data
                      ? `AI summary of your connected apps · Updated ${new Date(
                          brief.data.generatedAt,
                        ).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}`
                      : "AI summary of your connected apps"
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
    </>
  );
}
