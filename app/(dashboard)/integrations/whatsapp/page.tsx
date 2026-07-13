"use client";

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/components/dashboard/card";
import PageHeader from "@/components/dashboard/page-header";
import WhatsappSettings from "@/components/dashboard/whatsapp-settings";
import { useCurrentUser } from "@/lib/use-current-user";
import { useIntegrations } from "@/lib/use-integrations";

export default function WhatsappIntegrationPage() {
  const { user, isLoaded } = useCurrentUser();
  const { setStatusLocal } = useIntegrations(user?.id);
  const router = useRouter();

  return (
    <>
      <Link
        href="/integrations"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
        Back to integrations
      </Link>
      <PageHeader
        title="WhatsApp"
        description="Manage your WhatsApp connection and run its MCP tools."
      />

      {!isLoaded ? (
        <div className="space-y-5">
          <div className="skeleton h-32 rounded-3xl" />
          <div className="skeleton h-72 rounded-3xl" />
        </div>
      ) : !user ? (
        <Card className="mx-auto max-w-md text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            Sign in to manage WhatsApp
          </p>
          <Link
            href="/sign-in"
            className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
          >
            Sign in
          </Link>
        </Card>
      ) : (
        <WhatsappSettings
          userId={user.id}
          onDisconnected={() => {
            setStatusLocal("whatsapp", "disconnected");
            router.push("/integrations");
          }}
        />
      )}
    </>
  );
}
