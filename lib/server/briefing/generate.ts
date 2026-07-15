import {
  type BriefingCategories,
  type BriefingCategoryId,
  type BriefingDefinition,
  type BriefingItem,
  type BriefingResultData,
} from "@/lib/briefing-types";
import { NoProviderDataError } from "@/lib/server/dashboard/service";
import {
  timeKey,
  titleKey,
  type DashboardProvider,
  type ProviderSnapshot,
} from "@/lib/server/dashboard/provider";
import { DASHBOARD_PROVIDERS } from "@/lib/server/dashboard/registry";
import { adminSql } from "@/lib/server/db";
import { generateAiBriefingResult } from "./ai";

/** Per-provider fetch budget; a slow provider degrades, never blocks. */
const PROVIDER_TIMEOUT_MS = 12_000;

type Fetched = { provider: DashboardProvider; snapshot: ProviderSnapshot };

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${PROVIDER_TIMEOUT_MS}ms`)),
        PROVIDER_TIMEOUT_MS,
      ),
    ),
  ]);
}

/** Category whose count comes straight from a provider's snapshot counts. */
const COUNT_SOURCES: Partial<Record<BriefingCategoryId, string>> = {
  email: "gmail",
  messages: "whatsapp",
};

/**
 * Statistics are mechanical wherever provider data allows it — the AI writes
 * the prose and picks items; its counts are trusted only for categories
 * (mentions, tasks) that only the AI can identify.
 */
function mechanicalCount(
  category: BriefingCategoryId,
  fetched: Fetched[],
  itemCount: number,
): number {
  if (category === "follow_ups") {
    return fetched.reduce((sum, f) => sum + f.snapshot.followUpCount, 0);
  }
  const sourceId = COUNT_SOURCES[category];
  if (sourceId) {
    const source = fetched.find((f) => f.provider.id === sourceId);
    return source ? source.snapshot.importantCount : itemCount;
  }
  return itemCount;
}

function resolveLinks(
  items: BriefingItem[],
  links: Record<string, string>,
): BriefingItem[] {
  // Resolve deep links: by the AI's echoed ref, else deterministically by
  // the item's timestamp or title. ref never leaves the server.
  return items.map(({ ref, ...item }): BriefingItem => {
    const link =
      (ref ? links[ref] : undefined) ??
      links[timeKey(item.timestamp) ?? ""] ??
      links[titleKey(item.title) ?? ""];
    return link ? { ...item, link } : item;
  });
}

function emptyCategories(requested: readonly BriefingCategoryId[]): BriefingCategories {
  const categories: BriefingCategories = {};
  for (const key of requested) categories[key] = { count: 0, summary: "", items: [] };
  return categories;
}

/** Mechanical result when the AI is unavailable — never shows garbage. */
function fallbackResult(
  def: BriefingDefinition,
  fetched: Fetched[],
  generatedAt: string,
  partial: boolean,
): BriefingResultData {
  const categories = emptyCategories(def.categories);
  for (const [category, sourceId] of Object.entries(COUNT_SOURCES)) {
    const key = category as BriefingCategoryId;
    if (!categories[key]) continue;
    const source = fetched.find((f) => f.provider.id === sourceId);
    if (!source) continue;
    categories[key] = {
      count: source.snapshot.importantCount,
      summary: source.snapshot.fallbackBrief.map((e) => e.text).join(" "),
      items: source.snapshot.fallbackItems.map((item, index) => ({
        id: `${key}-${index}`,
        ...item,
      })),
    };
  }
  if (categories.follow_ups) {
    const followUps = fetched.reduce((s, f) => s + f.snapshot.followUpCount, 0);
    categories.follow_ups = {
      count: followUps,
      summary: followUps > 0 ? "Items are waiting on your reply." : "",
      items: [],
    };
  }
  const priorityItems = fetched
    .flatMap((f) => f.snapshot.fallbackItems)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5)
    .map((item, index) => ({ id: `priority-${index}`, ...item }));
  return {
    topSummary:
      fetched
        .flatMap((f) => f.snapshot.fallbackBrief.map((e) => e.text))
        .slice(0, 2)
        .join(" ") || "Here is your update from your connected apps.",
    categories,
    priorityItems,
    sources: fetched.map((f) => f.provider.id),
    degraded: true,
    partial,
    generatedAt,
  };
}

/**
 * Generates one briefing from the definition's selected providers:
 * fetches + normalizes provider data in parallel (per-provider timeouts),
 * asks the AI for the categorized brief, overrides counts mechanically,
 * and falls back to a mechanical result when the AI is unavailable.
 */
export async function generateBriefing(
  userId: string,
  def: BriefingDefinition,
): Promise<BriefingResultData> {
  const rows = await adminSql<{ provider: string }>(
    "SELECT provider FROM user_integrations WHERE user_id = $1 AND status = 'connected'",
    [userId],
  );
  const connectedIds = new Set(rows.map((row) => row.provider));
  const providers = DASHBOARD_PROVIDERS.filter(
    (p) =>
      connectedIds.has(p.id) && (def.apps.length === 0 || def.apps.includes(p.id)),
  );
  const generatedAt = new Date().toISOString();
  if (providers.length === 0) throw new NoProviderDataError();

  const results = await Promise.all(
    providers.map(async (provider): Promise<Fetched | null> => {
      try {
        const snapshot = await withTimeout(
          provider.fetchSnapshot(userId),
          provider.name,
        );
        return { provider, snapshot };
      } catch (error) {
        console.error(`Briefing: ${provider.id} fetch failed:`, error);
        return null;
      }
    }),
  );
  const fetched = results.filter((r): r is Fetched => r !== null);
  if (fetched.length === 0) throw new NoProviderDataError();
  // One provider down → keep the rest, flagged for the UI.
  const partial = fetched.length < providers.length;
  const sources = fetched.map((f) => f.provider.id);

  // Nothing to summarize (e.g. empty inbox) — skip the AI call entirely.
  if (fetched.every((f) => f.snapshot.isEmpty)) {
    return {
      topSummary: "All clear — nothing needs your attention right now.",
      categories: emptyCategories(def.categories),
      priorityItems: [],
      sources,
      degraded: false,
      partial,
      generatedAt,
    };
  }

  const links: Record<string, string> = Object.assign(
    {},
    ...fetched.map((f) => f.snapshot.links ?? {}),
  );
  try {
    const ai = await generateAiBriefingResult(
      def,
      {
        now: generatedAt,
        sources,
        data: Object.fromEntries(
          fetched.map((f) => [f.provider.id, f.snapshot.aiPayload]),
        ),
      },
      fetched.map((f) => f.provider.promptHint),
    );
    const categories: BriefingCategories = {};
    for (const key of def.categories) {
      const category = ai.categories[key] ?? { count: 0, summary: "", items: [] };
      categories[key] = {
        ...category,
        count: mechanicalCount(key, fetched, category.items.length),
        items: resolveLinks(category.items, links),
      };
    }
    return {
      topSummary: ai.topSummary,
      categories,
      priorityItems: resolveLinks(ai.priorityItems, links),
      sources,
      degraded: false,
      partial,
      generatedAt,
    };
  } catch (error) {
    console.error("Briefing: AI generation failed:", error);
    return fallbackResult(def, fetched, generatedAt, partial);
  }
}
