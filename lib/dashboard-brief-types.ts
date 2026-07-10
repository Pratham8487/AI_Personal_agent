/** Providers with live data backends that can feed the dashboard brief. */
export type BriefApp = "gmail" | "whatsapp";

export type BriefCounts = {
  important: number;
  priority: number;
  followUps: number;
};

export type BriefEntry = {
  text: string;
  apps: BriefApp[];
};

export type PriorityLevel = "low" | "medium" | "high";

export type PriorityItem = {
  app: BriefApp;
  title: string;
  time: string;
  description: string;
  priority: PriorityLevel;
};

export type DashboardBrief = {
  counts: BriefCounts;
  brief: BriefEntry[];
  priorityItems: PriorityItem[];
  sources: BriefApp[];
  generatedAt: string;
  /** True when the AI was unavailable and the brief was built mechanically. */
  degraded: boolean;
};

const BRIEF_APPS: readonly string[] = ["gmail", "whatsapp"];
const PRIORITY_LEVELS: readonly string[] = ["low", "medium", "high"];

function isBriefApp(value: unknown): value is BriefApp {
  return typeof value === "string" && BRIEF_APPS.includes(value);
}

function clampCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function cut(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function parseApps(value: unknown): BriefApp[] {
  return Array.isArray(value) ? value.filter(isBriefApp) : [];
}

/**
 * Narrows untrusted brief JSON (AI output or API response) into a
 * DashboardBrief. Drops malformed entries, clamps counts and string lengths,
 * and forces counts.priority to match the surviving priority items.
 */
export function sanitizeBrief(value: unknown): DashboardBrief | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!raw.counts || typeof raw.counts !== "object") return null;
  const counts = raw.counts as Record<string, unknown>;

  const brief: BriefEntry[] = (Array.isArray(raw.brief) ? raw.brief : [])
    .flatMap((entry): BriefEntry[] => {
      if (!entry || typeof entry !== "object") return [];
      const { text, apps } = entry as Record<string, unknown>;
      const summary = cut(text, 240);
      return summary ? [{ text: summary, apps: parseApps(apps) }] : [];
    })
    .slice(0, 5);

  const priorityItems: PriorityItem[] = (
    Array.isArray(raw.priorityItems) ? raw.priorityItems : []
  )
    .flatMap((item): PriorityItem[] => {
      if (!item || typeof item !== "object") return [];
      const { app, title, time, description, priority } = item as Record<
        string,
        unknown
      >;
      const heading = cut(title, 120);
      if (!isBriefApp(app) || !heading) return [];
      return [
        {
          app,
          title: heading,
          time: cut(time, 40),
          description: cut(description, 240),
          priority: PRIORITY_LEVELS.includes(priority as string)
            ? (priority as PriorityLevel)
            : "medium",
        },
      ];
    })
    .slice(0, 4);

  return {
    counts: {
      important: clampCount(counts.important),
      priority: priorityItems.length,
      followUps: clampCount(counts.followUps),
    },
    brief,
    priorityItems,
    sources: parseApps(raw.sources),
    generatedAt:
      typeof raw.generatedAt === "string" && raw.generatedAt
        ? raw.generatedAt
        : new Date().toISOString(),
    degraded: raw.degraded === true,
  };
}
