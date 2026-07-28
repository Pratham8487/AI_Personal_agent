"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/dashboard/card";
import IntegrationCard from "@/components/dashboard/integration-card";
import PageHeader from "@/components/dashboard/page-header";
import WhatsappPairDialog from "@/components/dashboard/whatsapp-pair-dialog";
import { PROVIDERS } from "@/lib/integrations";
import { useCurrentUser } from "@/lib/use-current-user";
import { useIntegrations } from "@/lib/use-integrations";

const gridClass = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/**
 * OAuth callbacks bounce back here as
 * `?int_error=<code>&provider=<id>` — the browser is mid-redirect, so failures
 * arrive as a query string rather than a JSON response.
 *
 * A few codes read better with the provider's name in them, so those are
 * functions of the provider id rather than fixed strings.
 */
const REDIRECT_ERRORS: Record<string, (name: string) => string> = {
  access_denied: (name) => `${name} access was denied. Try connecting again.`,
  invalid_state: () =>
    "The sign-in attempt could not be verified. Please retry.",
  exchange_failed: () => "The connection failed. Please retry.",
  not_configured: (name) =>
    `${name} is not configured. Add its client ID and secret to .env.local.`,

  // Microsoft's Work IQ MCP servers refuse some accounts outright. No retry can
  // fix these, so each says exactly what the account is missing.
  work_account_required: () =>
    "Outlook needs a Microsoft 365 work or school account. Personal Microsoft accounts aren't supported by Microsoft's Work IQ MCP servers.",
  copilot_license_required: () =>
    "This account needs a Microsoft 365 Copilot license to use Microsoft's Work IQ MCP servers.",
  admin_consent_required: () =>
    "A Microsoft 365 administrator has to grant this app consent before Outlook can connect.",
  work_iq_disabled: () =>
    "Work IQ isn't enabled in this Microsoft 365 tenant. An administrator has to turn it on.",
};

const GENERIC_REDIRECT_ERROR = "The connection failed. Please retry.";

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
  const [redirectError, setRedirectError] = useState<{
    provider: string;
    message: string;
  } | null>(null);

  // The provider list is public, but connecting needs an account. Signed-out
  // visitors clicking Connect are sent to sign in rather than failing silently.
  const requireAuth = useCallback(
    (action: () => void) => {
      if (!user) {
        router.push("/sign-in");
        return;
      }
      action();
    },
    [user, router],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("int_error");
    const provider = params.get("provider");
    if (code && provider) {
      const name =
        PROVIDERS.find((entry) => entry.id === provider)?.name ?? "The app";
      setRedirectError({
        provider,
        message: REDIRECT_ERRORS[code]?.(name) ?? GENERIC_REDIRECT_ERROR,
      });
    }
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
                errors[provider.id] ??
                (redirectError?.provider === provider.id
                  ? redirectError.message
                  : null)
              }
              onConnect={
                provider.id === "whatsapp"
                  ? () => requireAuth(() => setWhatsappPairing(true))
                  : () => requireAuth(() => connect(provider.id))
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
