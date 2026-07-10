"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/components/dashboard/card";
import IntegrationCard from "@/components/dashboard/integration-card";
import PageHeader from "@/components/dashboard/page-header";
import WhatsappPairDialog from "@/components/dashboard/whatsapp-pair-dialog";
import { PROVIDERS } from "@/lib/integrations";
import { useCurrentUser } from "@/lib/use-current-user";
import { useIntegrations } from "@/lib/use-integrations";

const gridClass = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

const GMAIL_REDIRECT_ERRORS: Record<string, string> = {
  access_denied: "Google access was denied. Try connecting again.",
  invalid_state: "The sign-in attempt could not be verified. Please retry.",
  invalid_user: "Sign in again before connecting Gmail.",
  exchange_failed: "Google connection failed. Please retry.",
  not_configured:
    "Gmail is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.",
};

export default function IntegrationsPage() {
  const router = useRouter();
  const { user, isLoaded } = useCurrentUser();
  const {
    statuses,
    isLoading,
    loadError,
    pending,
    errors,
    connect,
    disconnect,
    setStatusLocal,
  } = useIntegrations(user?.id);
  const [whatsappPairing, setWhatsappPairing] = useState(false);
  const [gmailRedirectError, setGmailRedirectError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("gmail_error");
    if (code) setGmailRedirectError(GMAIL_REDIRECT_ERRORS[code] ?? "Gmail connection failed.");
    if (code || params.get("connected")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect your apps securely. Your data stays yours."
      />

      {!isLoaded || (user && isLoading) ? (
        <div className={gridClass}>
          {PROVIDERS.map((provider) => (
            <div key={provider.id} className="skeleton h-56 rounded-3xl" />
          ))}
        </div>
      ) : !user ? (
        <Card className="mx-auto max-w-md text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            Sign in to manage your integrations
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Your connections are saved to your account.
          </p>
          <Link
            href="/sign-in"
            className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
          >
            Sign in
          </Link>
        </Card>
      ) : loadError ? (
        <Card className="mx-auto max-w-md text-center">
          <p className="text-sm text-rose-500">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            Retry
          </button>
        </Card>
      ) : (
        <div className={gridClass}>
          {PROVIDERS.map((provider) => (
            <IntegrationCard
              key={provider.id}
              provider={provider}
              status={statuses[provider.id]?.status}
              pending={Boolean(pending[provider.id])}
              error={
                provider.id === "gmail"
                  ? (errors.gmail ?? gmailRedirectError)
                  : errors[provider.id]
              }
              onConnect={
                provider.id === "whatsapp"
                  ? () => setWhatsappPairing(true)
                  : () => connect(provider.id)
              }
              onDisconnect={() => disconnect(provider.id)}
              onOpenSettings={() => router.push(`/integrations/${provider.id}`)}
            />
          ))}
        </div>
      )}

      {whatsappPairing && user && (
        <WhatsappPairDialog
          userId={user.id}
          onLinked={() => setStatusLocal("whatsapp", "connected")}
          onClose={() => setWhatsappPairing(false)}
        />
      )}

    </>
  );
}
