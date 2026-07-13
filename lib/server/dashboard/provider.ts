import type { BriefEntry, PriorityItem } from "@/lib/dashboard-brief-types";

/** Normalized result of one provider fetch. */
export type ProviderSnapshot = {
  /** Unread/urgent items that plausibly need attention today. */
  importantCount: number;
  /** Items mechanically detectable as waiting on the user's reply. */
  followUpCount: number;
  /** True when the provider returned no items at all (e.g. empty inbox). */
  isEmpty: boolean;
  /** Bounded, normalized data handed to the AI under this provider's id. */
  aiPayload: Record<string, unknown>;
  /** Mechanical brief entries used when the AI is unavailable. */
  fallbackBrief: BriefEntry[];
  /** Mechanical priority items used when the AI is unavailable. */
  fallbackItems: PriorityItem[];
  /**
   * Deep links keyed by the `ref` ids embedded in aiPayload items; the
   * service resolves the AI's echoed refs into PriorityItem.link.
   */
  links?: Record<string, string>;
};

/**
 * A dashboard data source. To add an integration (Slack, Calendar, Discord,
 * LinkedIn, Notion, …): implement this interface in providers/<id>.ts and
 * register it in registry.ts — the service, API shape, and UI need no changes.
 */
export type DashboardProvider = {
  /** Matches the provider id stored in user_integrations. */
  id: string;
  name: string;
  /** Icon key resolved by the client (components/dashboard/app-icon.tsx). */
  icon: string;
  /** One-line description of this provider's aiPayload for the AI prompt. */
  promptHint: string;
  /** Fetches + normalizes the latest data. Throws on failure or timeout. */
  fetchSnapshot(userId: string): Promise<ProviderSnapshot>;
};

/** Trims and truncates untrusted provider text before it reaches the AI. */
export function cut(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** Normalizes a provider date to ISO; empty string when unparseable. */
export function toIso(dateValue: string): string {
  const parsed = Date.parse(dateValue);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString();
}

/**
 * Epoch-based links key — timestamps survive AI round-trips in varying ISO
 * flavors (with/without milliseconds), so keys are the parsed epoch.
 */
export function timeKey(dateValue: string): string | null {
  const parsed = Date.parse(dateValue);
  return Number.isNaN(parsed) ? null : `t:${parsed}`;
}

/** Normalized-title links key, tolerant of casing/whitespace/truncation. */
export function titleKey(title: string): string | null {
  const normalized = title
    .toLowerCase()
    .replace(/(\.\.\.|…)$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return normalized ? `s:${normalized}` : null;
}
