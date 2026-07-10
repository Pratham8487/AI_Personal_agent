import {
  sanitizeBrief,
  type BriefApp,
  type BriefEntry,
  type DashboardBrief,
  type PriorityItem,
} from "@/lib/dashboard-brief-types";
import {
  AiNotConfiguredError,
  aiConfigured,
  generateDashboardBrief,
  type BriefEmail,
  type BriefSourceData,
  type BriefWhatsappMessage,
} from "@/lib/server/brief-ai";
import type { EmailSummary } from "@/lib/server/gmail-api";
import { callGmailTool } from "@/lib/server/gmail-mcp";
import { isUuid } from "@/lib/server/gmail-oauth";
import { adminSql } from "@/lib/server/phone-auth";
import { callWhatsappTool } from "@/lib/server/whatsapp-mcp";

/** Same "waiting on your reply" proxy as lib/use-gmail-data.ts. */
const AWAITING_QUERY = "in:inbox is:unread older_than:2d";

const LIVE_PROVIDERS: readonly BriefApp[] = ["gmail", "whatsapp"];

const DAY_MS = 86_400_000;
const MAX_EMAILS = 8;
const MAX_WA_MESSAGES = 15;

/**
 * Generated briefs are persisted in the dashboard_briefs table and reused for
 * 2 hours; only the Refresh button (force) regenerates earlier. The sources
 * signature invalidates the row when a provider is connected or disconnected.
 * Degraded (AI-unavailable) briefs expire quickly so recovery is picked up.
 */
const CACHE_TTL_MS = 2 * 60 * 60_000;
const DEGRADED_TTL_MS = 2 * 60_000;

async function readStoredBrief(
  userId: string,
  signature: string,
): Promise<DashboardBrief | null> {
  const rows = await adminSql<{ data: unknown; generated_at: string }>(
    "SELECT data, generated_at FROM dashboard_briefs WHERE user_id = $1 AND signature = $2",
    [userId, signature],
  );
  const row = rows[0];
  if (!row) return null;
  const data = sanitizeBrief(row.data);
  if (!data) return null;
  const age = Date.now() - new Date(row.generated_at).getTime();
  const ttl = data.degraded ? DEGRADED_TTL_MS : CACHE_TTL_MS;
  return Number.isFinite(age) && age < ttl ? data : null;
}

async function storeBrief(
  userId: string,
  signature: string,
  data: DashboardBrief,
): Promise<void> {
  await adminSql(
    `INSERT INTO dashboard_briefs (user_id, signature, data, generated_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (user_id)
     DO UPDATE SET signature = $2, data = $3::jsonb, generated_at = $4`,
    [userId, signature, JSON.stringify(data), data.generatedAt],
  );
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Short human time, e.g. "9:41 AM" today, else "Jul 9". */
function shortTime(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type GmailSlice = {
  unread: EmailSummary[];
  awaiting: EmailSummary[];
};

function parseEmails(structured: Record<string, unknown> | undefined) {
  const messages = structured?.messages;
  return Array.isArray(messages) ? (messages as EmailSummary[]) : [];
}

function toBriefEmails(emails: EmailSummary[]): BriefEmail[] {
  return emails.slice(0, MAX_EMAILS).map((email) => ({
    from: cut(email.from, 80),
    subject: cut(email.subject, 120),
    date: email.date,
    snippet: cut(email.snippet, 120),
  }));
}

async function fetchGmailSlice(userId: string): Promise<GmailSlice | null> {
  try {
    const [unread, awaiting] = await Promise.all([
      callGmailTool(userId, "search_inbox", {
        query: "in:inbox is:unread",
        count: 8,
      }),
      callGmailTool(userId, "search_inbox", { query: AWAITING_QUERY, count: 8 }),
    ]);
    return {
      unread: parseEmails(unread.structured),
      awaiting: parseEmails(awaiting.structured),
    };
  } catch (error) {
    console.error("Brief: Gmail data failed:", error);
    return null;
  }
}

type WaMessage = {
  chatName: string | null;
  sender: string | null;
  fromMe: boolean;
  text: string | null;
  sentAt: string;
};

async function fetchWhatsappSlice(
  userId: string,
): Promise<BriefWhatsappMessage[] | null> {
  try {
    const result = await callWhatsappTool(userId, "fetch_recent_messages", {
      count: 20,
    });
    const messages = result.structured?.messages;
    if (!Array.isArray(messages)) return [];
    const since = Date.now() - DAY_MS;
    // The tool returns all-time recent rows; keep only the last 24 hours.
    return (messages as WaMessage[])
      .filter(
        (m) => !m.fromMe && m.text && Date.parse(m.sentAt) >= since,
      )
      .slice(0, MAX_WA_MESSAGES)
      .map((m) => ({
        chat: m.chatName ?? "Direct chat",
        sender: m.sender ?? "Unknown",
        text: cut(m.text ?? "", 140),
        sentAt: m.sentAt,
      }));
  } catch (error) {
    console.error("Brief: WhatsApp data failed:", error);
    return null;
  }
}

/** Mechanical brief when the AI is unavailable — stats never show garbage. */
function fallbackBrief(
  gmail: GmailSlice | null,
  whatsapp: BriefWhatsappMessage[] | null,
  sources: BriefApp[],
): DashboardBrief {
  const priorityItems: PriorityItem[] = (gmail?.unread ?? [])
    .slice(0, 4)
    .map((email) => ({
      app: "gmail" as const,
      title: cut(email.subject, 120) || "(no subject)",
      time: shortTime(email.date),
      description: cut(email.snippet, 240),
      priority: "medium" as const,
    }));

  const unreadCount = gmail?.unread.length ?? 0;
  const awaitingCount = gmail?.awaiting.length ?? 0;
  const waCount = whatsapp?.length ?? 0;

  const brief: BriefEntry[] = [];
  if (gmail) {
    brief.push({
      text: `You have ${unreadCount} unread email${unreadCount === 1 ? "" : "s"}.`,
      apps: ["gmail"],
    });
    if (awaitingCount > 0) {
      brief.push({
        text: `${awaitingCount} email${awaitingCount === 1 ? " has" : "s have"} been waiting on you for 2+ days.`,
        apps: ["gmail"],
      });
    }
  }
  if (whatsapp) {
    brief.push({
      text: `${waCount} WhatsApp message${waCount === 1 ? "" : "s"} arrived in the last 24 hours.`,
      apps: ["whatsapp"],
    });
  }

  return {
    counts: {
      important: unreadCount + waCount,
      priority: priorityItems.length,
      followUps: awaitingCount,
    },
    brief,
    priorityItems,
    sources,
    generatedAt: new Date().toISOString(),
    degraded: true,
  };
}

export async function POST(request: Request) {
  let body: { userId?: string; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = body.userId ?? "";
  const force = body.force === true;
  if (!isUuid(userId)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }
  if (!aiConfigured()) {
    return Response.json(
      { error: new AiNotConfiguredError().message, code: "not_configured" },
      { status: 503 },
    );
  }

  try {
    const rows = await adminSql<{ provider: string }>(
      "SELECT provider FROM user_integrations WHERE user_id = $1 AND status = 'connected'",
      [userId],
    );
    const sources = LIVE_PROVIDERS.filter((provider) =>
      rows.some((row) => row.provider === provider),
    );
    const now = new Date().toISOString();

    if (sources.length === 0) {
      return Response.json({
        counts: { important: 0, priority: 0, followUps: 0 },
        brief: [],
        priorityItems: [],
        sources: [],
        generatedAt: now,
        degraded: false,
      } satisfies DashboardBrief);
    }

    const signature = sources.join(",");
    if (!force) {
      const stored = await readStoredBrief(userId, signature);
      if (stored) return Response.json(stored);
    }

    const [gmail, whatsapp] = await Promise.all([
      sources.includes("gmail") ? fetchGmailSlice(userId) : null,
      sources.includes("whatsapp") ? fetchWhatsappSlice(userId) : null,
    ]);
    if (!gmail && !whatsapp) {
      return Response.json(
        { error: "Could not load your brief. Please retry." },
        { status: 502 },
      );
    }

    const payload: BriefSourceData = {
      now,
      sources,
      unreadEmails: toBriefEmails(gmail?.unread ?? []),
      awaitingEmails: toBriefEmails(gmail?.awaiting ?? []),
      whatsappMessages: whatsapp ?? [],
    };

    let data: DashboardBrief;
    try {
      const generated = await generateDashboardBrief(payload);
      data = { ...generated, sources, generatedAt: now, degraded: false };
    } catch (error) {
      console.error("Brief: AI generation failed:", error);
      data = fallbackBrief(gmail, whatsapp, sources);
    }

    await storeBrief(userId, signature, data);
    return Response.json(data);
  } catch (error) {
    console.error("Brief: request failed:", error);
    return Response.json(
      { error: "Could not load your brief. Please retry." },
      { status: 502 },
    );
  }
}
