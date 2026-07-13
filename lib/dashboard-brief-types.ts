/**
 * Shared dashboard API types and sanitizers, used on both the client
 * (response guard) and the server (AI output + stored-row guard).
 */

export type BriefEntry = {
  text: string;
  /** Source provider ids; empty = cross-app "Today's Focus" entry. */
  apps: string[];
};

export type PriorityLevel = "low" | "medium" | "high";

export type PriorityItem = {
  /** Provider id, e.g. "gmail". */
  source: string;
  title: string;
  description: string;
  priority: PriorityLevel;
  /** ISO timestamp of the underlying item; may be empty when unknown. */
  timestamp: string;
  /** Deep link to the underlying item (e.g. the email in Gmail). */
  link?: string;
  /**
   * Source-item id echoed by the AI; the service resolves it to `link` and
   * strips it, so it never appears in API responses or stored rows.
   */
  ref?: string;
};

export type ConnectedApp = {
  id: string;
  name: string;
  connected: boolean;
  /** Icon key resolved by the client (components/dashboard/app-icon.tsx). */
  icon: string;
};

/** Manual-refresh usage inside the rolling window (backend-enforced). */
export type RefreshQuota = {
  used: number;
  remaining: number;
  limit: number;
  /** When the next slot frees up; null while refreshes remain. */
  nextRefreshAt: string | null;
};

export type DashboardData = {
  importantCount: number;
  priorityCount: number;
  followUpCount: number;
  connectedApps: ConnectedApp[];
  brief: BriefEntry[];
  priorityItems: PriorityItem[];
  lastUpdated: string;
  /** True when the AI was unavailable and the brief was built mechanically. */
  degraded: boolean;
  /** True when at least one connected provider failed or timed out. */
  partial?: boolean;
  /** When the cached AI summary expires and reopening regenerates it. */
  summaryExpiresAt?: string;
  /** Attached fresh by the service on every response; never persisted. */
  refresh?: RefreshQuota;
};

/** The subset the AI generates; the service fills in the rest. */
export type AiBrief = Pick<
  DashboardData,
  "importantCount" | "followUpCount" | "brief" | "priorityItems"
>;

const PRIORITY_LEVELS: readonly string[] = ["low", "medium", "high"];

function clampCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function cut(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Keeps non-empty strings; when valid sources are known, drops unknown ids. */
function parseApps(value: unknown, valid?: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (app): app is string =>
      typeof app === "string" && app.length > 0 && (!valid || valid.includes(app)),
  );
}

function parseEntries(value: unknown, valid?: readonly string[]): BriefEntry[] {
  return (Array.isArray(value) ? value : [])
    .flatMap((entry): BriefEntry[] => {
      if (!entry || typeof entry !== "object") return [];
      const { text, apps } = entry as Record<string, unknown>;
      const summary = cut(text, 240);
      return summary ? [{ text: summary, apps: parseApps(apps, valid) }] : [];
    })
    .slice(0, 6);
}

function parseItems(value: unknown, valid?: readonly string[]): PriorityItem[] {
  return (Array.isArray(value) ? value : [])
    .flatMap((item): PriorityItem[] => {
      if (!item || typeof item !== "object") return [];
      const { source, title, description, priority, timestamp } = item as Record<
        string,
        unknown
      >;
      const heading = cut(title, 120);
      const app =
        typeof source === "string" && source && (!valid || valid.includes(source))
          ? source
          : null;
      if (!app || !heading) return [];
      const time = cut(timestamp, 40);
      const { link, ref } = item as Record<string, unknown>;
      const safeLink =
        typeof link === "string" && /^https:\/\//.test(link)
          ? cut(link, 400)
          : undefined;
      const safeRef = cut(ref, 64) || undefined;
      return [
        {
          source: app,
          title: heading,
          description: cut(description, 240),
          priority: PRIORITY_LEVELS.includes(priority as string)
            ? (priority as PriorityLevel)
            : "medium",
          timestamp: Number.isNaN(Date.parse(time)) ? "" : time,
          ...(safeLink ? { link: safeLink } : {}),
          ...(safeRef ? { ref: safeRef } : {}),
        },
      ];
    })
    .slice(0, 4);
}

/**
 * Narrows untrusted AI output into the AI-generated subset of the dashboard.
 * Drops malformed entries and items, clamps counts and string lengths.
 */
export function sanitizeAiBrief(
  value: unknown,
  validSources: readonly string[],
): AiBrief | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return {
    importantCount: clampCount(raw.importantCount),
    followUpCount: clampCount(raw.followUpCount),
    brief: parseEntries(raw.brief, validSources),
    priorityItems: parseItems(raw.priorityItems, validSources),
  };
}

function parseConnectedApps(value: unknown): ConnectedApp[] {
  return (Array.isArray(value) ? value : []).flatMap((app): ConnectedApp[] => {
    if (!app || typeof app !== "object") return [];
    const { id, name, connected, icon } = app as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof name !== "string") return [];
    return [
      {
        id,
        name,
        connected: connected === true,
        icon: typeof icon === "string" ? icon : id,
      },
    ];
  });
}

/**
 * Narrows a full untrusted dashboard payload (API response or stored row).
 * Strict on importantCount/lastUpdated so rows in older shapes are rejected
 * and regenerated instead of rendering as empty.
 */
export function sanitizeDashboard(value: unknown): DashboardData | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.importantCount !== "number") return null;
  if (typeof raw.lastUpdated !== "string" || !raw.lastUpdated) return null;
  const priorityItems = parseItems(raw.priorityItems);
  return {
    importantCount: clampCount(raw.importantCount),
    priorityCount: priorityItems.length,
    followUpCount: clampCount(raw.followUpCount),
    connectedApps: parseConnectedApps(raw.connectedApps),
    brief: parseEntries(raw.brief),
    priorityItems,
    lastUpdated: raw.lastUpdated,
    degraded: raw.degraded === true,
    partial: raw.partial === true,
    ...(typeof raw.summaryExpiresAt === "string" && raw.summaryExpiresAt
      ? { summaryExpiresAt: raw.summaryExpiresAt }
      : {}),
    ...(parseRefresh(raw.refresh) ?? {}),
  };
}

function parseRefresh(value: unknown): { refresh: RefreshQuota } | null {
  if (!value || typeof value !== "object") return null;
  const { used, remaining, limit, nextRefreshAt } = value as Record<
    string,
    unknown
  >;
  if (typeof limit !== "number" || limit <= 0) return null;
  return {
    refresh: {
      used: clampCount(used),
      remaining: clampCount(remaining),
      limit: clampCount(limit),
      nextRefreshAt:
        typeof nextRefreshAt === "string" && nextRefreshAt
          ? nextRefreshAt
          : null,
    },
  };
}
