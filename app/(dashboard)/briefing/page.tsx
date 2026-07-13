"use client";

import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useState } from "react";
import CategoryGrid from "@/components/briefing/category-grid";
import CreateBriefingDialog from "@/components/briefing/create-briefing-dialog";
import CustomBriefingsCard from "@/components/briefing/custom-briefings-card";
import HistoryCard from "@/components/briefing/history-card";
import TopBriefCard from "@/components/briefing/top-brief-card";
import { primaryButtonClass } from "@/components/dashboard/form-classes";
import GmailConnectCard from "@/components/dashboard/gmail-connect-card";
import PageHeader from "@/components/dashboard/page-header";
import Toast from "@/components/dashboard/toast";
import type { BriefingDefinition } from "@/lib/briefing-types";
import { STATUS_CONNECTED } from "@/lib/integrations";
import { useBriefings } from "@/lib/use-briefings";
import { useCurrentUser } from "@/lib/use-current-user";
import { useIntegrations } from "@/lib/use-integrations";
import { useToday } from "@/lib/use-today";

export default function BriefingPage() {
  const { user, isLoaded } = useCurrentUser();
  const { statuses, isLoading } = useIntegrations(user?.id);
  const today = useToday();

  const gmailConnected = statuses.gmail?.status === STATUS_CONNECTED;
  const whatsappConnected = statuses.whatsapp?.status === STATUS_CONNECTED;
  const hasLiveSource = gmailConnected || whatsappConnected;
  const gatesLoading = !isLoaded || Boolean(user && isLoading);

  const briefings = useBriefings(user?.id, Boolean(user) && hasLiveSource);
  const [dialogConfig, setDialogConfig] = useState<
    BriefingDefinition | "new" | null
  >(null);

  const data = briefings.data;
  const defaultConfig = data?.configs.find((c) => c.isDefault) ?? null;
  const quotaRemaining = data?.refresh?.remaining;
  const quotaExhausted = quotaRemaining !== undefined && quotaRemaining <= 0;
  const connectedProviderIds = [
    ...(gmailConnected ? ["gmail"] : []),
    ...(whatsappConnected ? ["whatsapp"] : []),
  ];

  const generateDefault = useCallback(() => {
    if (defaultConfig) void briefings.generateNow(defaultConfig.id);
  }, [defaultConfig, briefings]);

  return (
    <>
      <PageHeader
        title="Briefing"
        description={
          today
            ? `Smart, actionable briefings from your connected apps · ${today}`
            : "Smart, actionable briefings from your connected apps."
        }
        action={
          user && hasLiveSource ? (
            <button
              type="button"
              onClick={() => setDialogConfig("new")}
              className={`flex shrink-0 items-center gap-2 ${primaryButtonClass}`}
            >
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
              Create briefing
            </button>
          ) : undefined
        }
      />

      {gatesLoading ? (
        <div className="space-y-4">
          <div className="skeleton h-40 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-32 rounded-3xl" />
            ))}
          </div>
        </div>
      ) : !user ? (
        <GmailConnectCard variant="sign-in" className="mx-auto max-w-md" />
      ) : !hasLiveSource ? (
        <GmailConnectCard variant="connect" className="mx-auto max-w-md" />
      ) : (
        <div className="space-y-4">
          <TopBriefCard
            status={briefings.status}
            briefing={data?.today ?? null}
            error={briefings.error}
            onRetry={briefings.retry}
            onGenerate={generateDefault}
            isGenerating={
              briefings.generatingId !== null &&
              briefings.generatingId === defaultConfig?.id
            }
            quotaRemaining={quotaRemaining}
          />
          <CategoryGrid
            status={briefings.status}
            categories={data?.today?.categories ?? null}
            briefingHref={data?.today ? `/briefing/${data.today.id}` : null}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <CustomBriefingsCard
              status={briefings.status}
              configs={data?.configs ?? []}
              error={briefings.error}
              onRetry={briefings.retry}
              onCreate={() => setDialogConfig("new")}
              onEdit={(config) => setDialogConfig(config)}
              onDelete={(id) => void briefings.deleteBriefing(id)}
              onGenerateNow={(id) => void briefings.generateNow(id)}
              generatingId={briefings.generatingId}
              quotaExhausted={quotaExhausted}
            />
            <HistoryCard
              status={briefings.status}
              items={data?.history ?? []}
              error={briefings.error}
              onRetry={briefings.retry}
            />
          </div>
        </div>
      )}

      {dialogConfig && (
        <CreateBriefingDialog
          connectedProviderIds={connectedProviderIds}
          initial={dialogConfig === "new" ? null : dialogConfig}
          savingError={briefings.savingError}
          onSave={(input, enabled) =>
            dialogConfig === "new"
              ? briefings.createBriefing(input)
              : briefings.updateBriefing(dialogConfig.id, input, enabled)
          }
          onGenerateNow={briefings.generateNow}
          onClose={() => setDialogConfig(null)}
        />
      )}

      <Toast message={briefings.limitNotice} />
    </>
  );
}
