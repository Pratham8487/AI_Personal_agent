"use client";

import {
  Calendar03Icon,
  Clock01Icon,
  Mail01Icon,
  MessageMultiple01Icon,
} from "@hugeicons/core-free-icons";
import ActivityChart from "@/components/dashboard/activity-chart";
import Card from "@/components/dashboard/card";
import GmailConnectCard from "@/components/dashboard/gmail-connect-card";
import GmailEmailList from "@/components/dashboard/gmail-email-list";
import PageHeader from "@/components/dashboard/page-header";
import StatCard from "@/components/dashboard/stat-card";
import { formatCountStat } from "@/lib/gmail-mcp-client";
import { STATUS_CONNECTED } from "@/lib/integrations";
import { useCurrentUser } from "@/lib/use-current-user";
import { useGmailData } from "@/lib/use-gmail-data";
import { useIntegrations } from "@/lib/use-integrations";
import { useToday } from "@/lib/use-today";

export default function DashboardPage() {
  const { user, isLoaded } = useCurrentUser();
  const { statuses, isLoading } = useIntegrations(user?.id);
  const gmailConnected = statuses.gmail?.status === STATUS_CONNECTED;
  const gmail = useGmailData(user?.id, gmailConnected);
  const gatesLoading = !isLoaded || Boolean(user && isLoading);
  const today = useToday();

  // null → still loading (skeleton tile); "—" → no live data available.
  const liveStat = (value: string): string | null => {
    if (gatesLoading || (gmailConnected && gmail.status !== "ready" && gmail.status !== "error")) {
      return null;
    }
    if (!user || !gmailConnected || gmail.status !== "ready") return "—";
    return value;
  };

  const emailsToday = gmail.weekly[6]?.value ?? 0;
  const stats = [
    {
      label: "Emails today",
      value: liveStat(emailsToday.toLocaleString("en-US")),
      icon: Calendar03Icon,
      iconBg: "bg-indigo-500 shadow-indigo-500/40",
    },
    {
      label: "Unread emails",
      value: liveStat(formatCountStat(gmail.unreadCount)),
      icon: Mail01Icon,
      iconBg: "bg-rose-500 shadow-rose-500/40",
    },
    {
      label: "Awaiting your reply",
      value: liveStat(formatCountStat(gmail.awaitingCount)),
      icon: Clock01Icon,
      iconBg: "bg-amber-500 shadow-amber-500/40",
    },
    {
      label: "Inbox messages",
      value: liveStat(
        gmail.profile ? gmail.profile.messagesTotal.toLocaleString("en-US") : "—",
      ),
      icon: MessageMultiple01Icon,
      iconBg: "bg-violet-500 shadow-violet-500/40",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Welcome back. Here's what's happening across your inboxes."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) =>
          stat.value === null ? (
            <div key={stat.label} className="skeleton h-24 rounded-3xl" />
          ) : (
            <StatCard key={stat.label} {...stat} value={stat.value} />
          ),
        )}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card
          title="Weekly activity"
          subtitle="Emails received per day"
          className="xl:col-span-2"
        >
          {gmailConnected && gmail.status === "ready" ? (
            <ActivityChart data={gmail.weekly} />
          ) : gmailConnected && gmail.status === "loading" ? (
            <div className="skeleton h-40 rounded-xl" />
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Connect Gmail to see your weekly email activity.
            </p>
          )}
        </Card>
        {gatesLoading ? (
          <>
            <div className="skeleton h-56 rounded-3xl" />
            <div className="skeleton h-56 rounded-3xl" />
          </>
        ) : !user || !gmailConnected ? (
          <GmailConnectCard
            variant={user ? "connect" : "sign-in"}
            className="xl:col-span-2"
          />
        ) : (
          <>
            <Card
              title="Today's briefing"
              subtitle={today ?? "Latest from Gmail"}
            >
              <GmailEmailList
                status={gmail.status}
                emails={gmail.emails.slice(0, 3)}
                error={gmail.error}
                onRetry={gmail.retry}
                emptyText="Your inbox is empty."
              />
            </Card>
            <Card title="Important alerts" subtitle="Unread messages from Gmail">
              <GmailEmailList
                status={gmail.status}
                emails={gmail.unread.slice(0, 3)}
                error={gmail.error}
                onRetry={gmail.retry}
                emptyText="No unread emails."
                badgeLabel="Unread"
              />
            </Card>
            <Card
              title="Pending follow-ups"
              subtitle="Unread for more than 2 days"
              className="xl:col-span-2"
            >
              <GmailEmailList
                status={gmail.status}
                emails={gmail.awaiting}
                error={gmail.error}
                onRetry={gmail.retry}
                emptyText="Nothing waiting on you. Nice work!"
              />
            </Card>
          </>
        )}
      </div>
    </>
  );
}
