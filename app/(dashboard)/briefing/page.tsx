"use client";

import Card from "@/components/dashboard/card";
import GmailConnectCard from "@/components/dashboard/gmail-connect-card";
import GmailEmailList from "@/components/dashboard/gmail-email-list";
import PageHeader from "@/components/dashboard/page-header";
import { formatCountStat } from "@/lib/gmail-mcp-client";
import { STATUS_CONNECTED } from "@/lib/integrations";
import { useCurrentUser } from "@/lib/use-current-user";
import { useGmailData } from "@/lib/use-gmail-data";
import { useIntegrations } from "@/lib/use-integrations";
import { useToday } from "@/lib/use-today";

export default function BriefingPage() {
  const { user, isLoaded } = useCurrentUser();
  const { statuses, isLoading } = useIntegrations(user?.id);
  const gmailConnected = statuses.gmail?.status === STATUS_CONNECTED;
  const gmail = useGmailData(user?.id, gmailConnected);
  const today = useToday();

  const description = [
    `Your morning digest${today ? ` for ${today}` : ""}.`,
    gmail.profile ? `Connected as ${gmail.profile.emailAddress}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <PageHeader title="Briefing" description={description} />
      {!isLoaded || (user && isLoading) ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="skeleton h-56 rounded-3xl" />
          <div className="skeleton h-56 rounded-3xl" />
        </div>
      ) : !user ? (
        <GmailConnectCard variant="sign-in" className="mx-auto max-w-md" />
      ) : !gmailConnected ? (
        <GmailConnectCard variant="connect" className="mx-auto max-w-md" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title="Important emails"
            subtitle={
              gmail.status === "ready" && gmail.unreadCount.count > 0
                ? `${formatCountStat(gmail.unreadCount)} unread`
                : "Latest from your inbox"
            }
          >
            <GmailEmailList
              status={gmail.status}
              emails={gmail.emails}
              error={gmail.error}
              onRetry={gmail.retry}
              emptyText="Your inbox is empty."
            />
          </Card>
          <Card title="Pending follow-ups" subtitle="Unread for more than 2 days">
            <GmailEmailList
              status={gmail.status}
              emails={gmail.awaiting}
              error={gmail.error}
              onRetry={gmail.retry}
              emptyText="Nothing waiting on you. Nice work!"
            />
          </Card>
        </div>
      )}
    </>
  );
}
