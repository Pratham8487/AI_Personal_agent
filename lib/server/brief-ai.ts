import {
  sanitizeBrief,
  type BriefApp,
  type DashboardBrief,
} from "../dashboard-brief-types";

/**
 * Generic, provider-switchable AI client over the OpenAI-compatible Chat
 * Completions API. Switching models needs only .env.local changes:
 *   OPENAI_API_KEY  — provider API key (required)
 *   OPENAI_MODEL    — model id (default gpt-4o-mini)
 *   OPENAI_BASE_URL — e.g. https://generativelanguage.googleapis.com/v1beta/openai
 *                     for Gemini, or any OpenAI-compatible endpoint
 */
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const BASE_URL = (
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
).replace(/\/+$/, "");

const TIMEOUT_MS = 15_000;

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI model is not configured. Set OPENAI_API_KEY in .env.local.");
    this.name = "AiNotConfiguredError";
  }
}

export function aiConfigured(): boolean {
  return Boolean(API_KEY);
}

export type BriefEmail = {
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

export type BriefWhatsappMessage = {
  chat: string;
  sender: string;
  text: string;
  sentAt: string;
};

/** Bounded snapshot of today's data across connected apps. */
export type BriefSourceData = {
  now: string;
  sources: BriefApp[];
  unreadEmails: BriefEmail[];
  awaitingEmails: BriefEmail[];
  whatsappMessages: BriefWhatsappMessage[];
};

const SYSTEM_PROMPT = `You generate a very concise daily brief for a personal dashboard from the user's connected app data (Gmail emails, WhatsApp messages). Be extremely brief — short punchy sentences, no filler.
Rules:
- Use ONLY the provided data. Never invent senders, times, counts, or content.
- Respond with a single JSON object and nothing else, matching exactly:
{"counts":{"important":<int>,"priority":<int>,"followUps":<int>},"brief":[{"text":<string>,"apps":["gmail"|"whatsapp",...]}],"priorityItems":[{"app":"gmail"|"whatsapp","title":<string>,"time":<string>,"description":<string>,"priority":"low"|"medium"|"high"}]}
- unreadEmails are unread inbox emails; awaitingEmails have been unread for 2+ days; whatsappMessages are from the last 24 hours.
- brief: 2-3 short one-sentence summaries (max 90 characters each) of the most notable items or themes, each tagged with its source app(s). Name the key sender or topic.
- priorityItems: the 3 most urgent items, most urgent first. title <= 60 chars; description <= 100 chars with the key fact (who/what) and why it needs attention; time = short human time derived from the item's timestamp and "now" (e.g. "9:41 AM", "Yesterday").
- counts.important = number of distinct items in the data that plausibly need the user's attention today.
- counts.priority = the number of priorityItems.
- counts.followUps = number of awaitingEmails plus WhatsApp threads clearly awaiting the user's reply.`;

/** Some models wrap JSON in markdown fences despite instructions. */
function stripFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
}

async function chatCompletion(
  payload: BriefSourceData,
  withJsonFormat: boolean,
): Promise<Response> {
  return fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0.3,
      max_tokens: 400,
      ...(withJsonFormat
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Generates the dashboard brief from the bounded source data. Throws on any
 * failure (missing key, HTTP error, timeout, unparseable output) — the caller
 * falls back to a mechanical brief; this function never invents data.
 */
export async function generateDashboardBrief(
  payload: BriefSourceData,
): Promise<DashboardBrief> {
  if (!aiConfigured()) throw new AiNotConfiguredError();

  // Providers without response_format support reject the request with 400;
  // retry once relying on the prompt alone (sanitizeBrief guards the shape).
  let res = await chatCompletion(payload, true);
  if (res.status === 400) res = await chatCompletion(payload, false);
  if (!res.ok) {
    throw new Error(`AI request failed (${res.status} ${MODEL})`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI response was empty.");
  }

  const parsed: unknown = JSON.parse(stripFences(content));
  const brief = sanitizeBrief(parsed);
  if (!brief) throw new Error("AI response did not match the brief shape.");
  return brief;
}
