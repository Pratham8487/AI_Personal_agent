"use client";

import Link from "next/link";
import Card from "@/components/dashboard/card";
import GmailMcpTools from "@/components/dashboard/gmail-mcp-tools";
import PageHeader from "@/components/dashboard/page-header";
import { STATUS_CONNECTED } from "@/lib/integrations";
import { useCurrentUser } from "@/lib/use-current-user";
import { useIntegrations } from "@/lib/use-integrations";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

export default function GmailIntegrationPage() {
  const { user, isLoaded } = useCurrentUser();
  const { statuses, pending, errors, disconnect } = useIntegrations(user?.id);
  const gmail = statuses.gmail;
  const connected = gmail?.status === STATUS_CONNECTED;

  return (
    <>
      <Link
        href="/integrations"
        className="mb-4 inline-block text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      >
        ← Back to integrations
      </Link>
      <PageHeader
        title="Gmail"
        description="Manage your Gmail connection and run its MCP tools."
      />

      {!isLoaded ? (
        <div className="space-y-5">
          <div className="skeleton h-32 rounded-3xl" />
          <div className="skeleton h-72 rounded-3xl" />
        </div>
      ) : !user ? (
        <Card className="mx-auto max-w-md text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            Sign in to manage Gmail
          </p>
          <Link
            href="/sign-in"
            className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
          >
            Sign in
          </Link>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card
            title="Connection"
            action={
              connected ? (
                <button
                  type="button"
                  onClick={() => void disconnect("gmail")}
                  disabled={Boolean(pending.gmail)}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-500 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
                >
                  {pending.gmail ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : (
                <Link
                  href="/integrations"
                  className="rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
                >
                  Connect
                </Link>
              )
            }
          >
            <div className="flex flex-wrap gap-x-12 gap-y-4">
              <Stat
                label="Connection status"
                value={
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold ${connected ? "text-emerald-500" : "text-zinc-500 dark:text-zinc-400"}`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-emerald-500" : "bg-zinc-400"}`}
                    />
                    {connected ? "Connected" : "Disconnected"}
                  </span>
                }
              />
              <Stat
                label="Connected since"
                value={
                  gmail?.connected_at
                    ? new Date(gmail.connected_at).toLocaleDateString()
                    : "—"
                }
              />
            </div>
            {errors.gmail && (
              <p className="mt-3 text-sm text-rose-500">{errors.gmail}</p>
            )}
          </Card>

          <Card
            title="Available MCP tools"
            subtitle="Run any tool live against your linked Gmail account."
          >
            <GmailMcpTools userId={user.id} />
          </Card>
        </div>
      )}
    </>
  );
}
