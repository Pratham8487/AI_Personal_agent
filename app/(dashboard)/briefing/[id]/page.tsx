"use client";

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { use, useState } from "react";
import BriefingItemList from "@/components/briefing/briefing-item-list";
import { CATEGORY_META } from "@/components/briefing/category-meta";
import CategoryTabs from "@/components/briefing/category-tabs";
import ComposeDialog from "@/components/briefing/compose-dialog";
import { dateTimeLabel } from "@/components/briefing/format";
import Badge from "@/components/dashboard/badge";
import Card from "@/components/dashboard/card";
import { secondaryButtonClass } from "@/components/dashboard/form-classes";
import GmailConnectCard from "@/components/dashboard/gmail-connect-card";
import PageHeader from "@/components/dashboard/page-header";
import Toast from "@/components/dashboard/toast";
import {
  categoryFromSlug,
  type BriefingItem,
} from "@/lib/briefing-types";
import { STATUS_CONNECTED } from "@/lib/integrations";
import { useBriefingDetail } from "@/lib/use-briefing-detail";
import { useCurrentUser } from "@/lib/use-current-user";
import { useIntegrations } from "@/lib/use-integrations";

export default function BriefingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const search = useSearchParams();
  const { user, isLoaded } = useCurrentUser();
  const { statuses } = useIntegrations(user?.id);
  const detail = useBriefingDetail(user?.id, id);

  const activeCategory = categoryFromSlug(search.get("category") ?? "") ?? "all";
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    search.get("item"),
  );
  const [composeItem, setComposeItem] = useState<BriefingItem | null>(null);
  const [sentNotice, setSentNotice] = useState<string | null>(null);

  const briefing = detail.briefing;
  const connected = {
    gmail: statuses.gmail?.status === STATUS_CONNECTED,
    whatsapp: statuses.whatsapp?.status === STATUS_CONNECTED,
  };

  const makeHref = (slug: string | null) =>
    slug ? `/briefing/${id}?category=${slug}` : `/briefing/${id}`;

  const visibleCategories =
    activeCategory === "all"
      ? CATEGORY_META.filter((meta) => briefing?.categories[meta.id])
      : CATEGORY_META.filter((meta) => meta.id === activeCategory);

  return (
    <>
      <Link
        href="/briefing"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
        Briefing
      </Link>

      {!isLoaded ? (
        <div className="space-y-4">
          <div className="skeleton h-16 w-1/2 rounded-2xl" />
          <div className="skeleton h-32 rounded-3xl" />
          <div className="skeleton h-56 rounded-3xl" />
        </div>
      ) : !user ? (
        <GmailConnectCard variant="sign-in" className="mx-auto max-w-md" />
      ) : detail.notFound ? (
        <Card className="mx-auto max-w-md text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            This briefing no longer exists
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            It may have been deleted or pruned from history.
          </p>
          <Link
            href="/briefing"
            className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
          >
            Back to briefings
          </Link>
        </Card>
      ) : detail.status === "error" ? (
        <Card className="mx-auto max-w-md text-center">
          <p className="text-sm text-rose-500">
            {detail.error ?? "Could not load this briefing."}
          </p>
          <button
            type="button"
            onClick={detail.retry}
            className={`mt-3 ${secondaryButtonClass}`}
          >
            Retry
          </button>
        </Card>
      ) : !briefing ? (
        <div className="space-y-4">
          <div className="skeleton h-16 w-1/2 rounded-2xl" />
          <div className="skeleton h-32 rounded-3xl" />
          <div className="skeleton h-56 rounded-3xl" />
        </div>
      ) : (
        <>
          <PageHeader
            title={briefing.title}
            description={`AI Generated · ${dateTimeLabel(briefing.generatedAt)}`}
            action={
              <Badge tone={briefing.isDefault ? "indigo" : "zinc"}>
                {briefing.isDefault ? "Daily" : "Custom"}
              </Badge>
            }
          />

          {(briefing.degraded || briefing.partial) && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              {briefing.degraded
                ? "AI was unavailable for this briefing — showing basics."
                : "Partial data — a connected app didn't respond during generation."}
            </div>
          )}

          <div className="space-y-4">
            <Card title="Summary">
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                {briefing.topSummary}
              </p>
            </Card>

            <CategoryTabs
              categories={briefing.categories}
              active={activeCategory}
              makeHref={makeHref}
            />

            {activeCategory === "all" && briefing.priorityItems.length > 0 && (
              <Card title="Top highlights" subtitle="Most urgent first">
                <BriefingItemList
                  items={briefing.priorityItems}
                  selectedId={selectedItemId}
                  onSelect={setSelectedItemId}
                  onCompose={setComposeItem}
                  emptyText="Nothing urgent right now."
                />
              </Card>
            )}

            {visibleCategories.map((meta) => {
              const category = briefing.categories[meta.id];
              if (!category) return null;
              return (
                <Card
                  key={meta.id}
                  title={`${meta.label} (${category.count})`}
                  subtitle={category.summary || undefined}
                >
                  <BriefingItemList
                    items={category.items}
                    selectedId={selectedItemId}
                    onSelect={setSelectedItemId}
                    onCompose={setComposeItem}
                    emptyText={meta.emptyText}
                  />
                </Card>
              );
            })}
          </div>

          {composeItem && user && (
            <ComposeDialog
              userId={user.id}
              resultId={briefing.id}
              item={composeItem}
              connected={connected}
              onClose={() => setComposeItem(null)}
              onSent={setSentNotice}
            />
          )}
        </>
      )}

      <Toast message={sentNotice} />
    </>
  );
}
