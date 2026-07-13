import {
  sanitizeAiBriefingResult,
  type AiBriefingResult,
  type BriefingCategoryId,
  type BriefingDefinition,
} from "@/lib/briefing-types";
import { chatJson } from "@/lib/server/brief-ai";

const CATEGORY_GUIDE: Record<BriefingCategoryId, string> = {
  email: "important emails needing attention (ignore newsletters/spam/promos)",
  messages: "notable chat messages and conversations",
  mentions: "places the user is directly mentioned, named, or addressed",
  tasks: "action items, to-dos, and commitments extracted from the data",
  follow_ups: "items clearly waiting on the user's reply or follow-up",
};

const PRIORITY_GUIDE: Record<string, string> = {
  low: "Include routine items too; be generous about what counts.",
  medium: "Focus on items that matter today; skip trivia.",
  high: "STRICT: include only urgent, high-impact items; drop everything routine.",
};

function itemShape(sourceList: string): string {
  return `{"source":${sourceList},"title":<string>,"description":<string>,"priority":"low"|"medium"|"high","timestamp":<ISO 8601 string>,"ref":<string>}`;
}

export function buildBriefingPrompt(
  def: BriefingDefinition,
  sources: string[],
  promptHints: string[],
): string {
  const sourceList = sources.map((s) => `"${s}"`).join("|");
  const categories = def.categories
    .map((c) => `"${c}":{"count":<int>,"summary":<string>,"items":[${itemShape(sourceList)},...]}`)
    .join(",");
  const guide = def.categories
    .map((c) => `${c} = ${CATEGORY_GUIDE[c]}`)
    .join("; ");
  return `You generate a categorized briefing ("${def.name}") for a personal dashboard from the user's connected app data. Be concise — short punchy sentences, no filler.
${def.description ? `Briefing goal: ${def.description}\n` : ""}Rules:
- Use ONLY the provided data. Never invent senders, times, counts, or content.
- Priority level "${def.priority}": ${PRIORITY_GUIDE[def.priority]}
- Respond with a single JSON object and nothing else, matching exactly:
{"topSummary":<string>,"categories":{${categories}},"priorityItems":[${itemShape(sourceList)},...]}
- Data notes: ${promptHints.join(" ")}
- topSummary: 1-3 sentences (max 280 characters) summarizing the most important updates across all categories, most urgent first.
- Categories: ${guide}. Output ONLY these category keys. An item belongs to exactly one category (the best fit). For each: summary = one sentence (max 180 chars); items = up to 8, most important first; count = number of matching items you found in the data.
- priorityItems: the top 5 most urgent items overall, most urgent first.
- Every item: title <= 60 chars; description <= 120 chars with the key fact (who/what) and why it needs attention; timestamp = the underlying item's own timestamp copied verbatim; ref = the underlying item's "ref" value copied EXACTLY, character for character — required whenever the source item has a "ref" field; omit only when it truly has none.`;
}

export async function generateAiBriefingResult(
  def: BriefingDefinition,
  payload: { now: string; sources: string[]; data: Record<string, unknown> },
  promptHints: string[],
): Promise<AiBriefingResult> {
  // Category output is large (up to 8 items × 5 categories + 5 priority
  // items); a small cap truncates the JSON mid-string and forces fallback.
  const parsed = await chatJson(
    buildBriefingPrompt(def, payload.sources, promptHints),
    payload,
    { maxTokens: 3000, timeoutMs: 30_000 },
  );
  const result = sanitizeAiBriefingResult(parsed, payload.sources, def.categories);
  if (!result) throw new Error("AI response did not match the briefing shape.");
  return result;
}

/* --------------------------------- compose ------------------------------- */

export type ComposeChannel = "gmail" | "whatsapp";

export type ComposeDraft = {
  to: string;
  subject?: string;
  body: string;
};

export type ComposeContext = {
  item: { title: string; description: string; source: string; timestamp?: string };
  briefingSummary?: string;
  instruction?: string;
};

function cut(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? text.slice(0, max) : text;
}

/** Drafts a reply for the given briefing item; recipient stays editable. */
export async function composeDraft(
  channel: ComposeChannel,
  context: ComposeContext,
): Promise<ComposeDraft> {
  const shape =
    channel === "gmail"
      ? `{"to":<recipient email address found in the context, else "">,"subject":<string>,"body":<string>}`
      : `{"to":<recipient phone number or chat id found in the context, else "">,"body":<string>}`;
  const prompt = `You draft a ${channel === "gmail" ? "professional email" : "short WhatsApp message"} for the user, responding to an item from their daily briefing.
Rules:
- Respond with a single JSON object and nothing else, matching exactly: ${shape}
- Ground the draft ONLY in the provided context. Never invent facts, names, or commitments.
- Write in the first person as the user. Keep it ${channel === "gmail" ? "clear and courteous (under 150 words)" : "casual and brief (under 60 words)"}.
- Do not include placeholders like [name] — omit what you don't know.
${context.instruction ? `- The user asked: ${cut(context.instruction, 300)}` : ""}`;
  const parsed = await chatJson(prompt, context, {
    maxTokens: 500,
    timeoutMs: 20_000,
  });
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI draft did not match the expected shape.");
  }
  const raw = parsed as Record<string, unknown>;
  const body = cut(raw.body, 10_000);
  if (!body) throw new Error("AI draft was empty.");
  return {
    to: cut(raw.to, 320),
    ...(channel === "gmail" ? { subject: cut(raw.subject, 300) } : {}),
    body,
  };
}
