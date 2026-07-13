import { sanitizeAiBrief, type AiBrief } from "../dashboard-brief-types";

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

/**
 * Provider-agnostic AI input: `data` holds each connected provider's bounded,
 * normalized payload keyed by provider id (built by lib/server/dashboard).
 */
export type AiSourcePayload = {
  now: string;
  sources: string[];
  data: Record<string, Record<string, unknown>>;
};

function buildSystemPrompt(
  sources: string[],
  promptHints: string[],
): string {
  const sourceList = sources.map((s) => `"${s}"`).join("|");
  return `You generate a very concise daily brief for a personal dashboard from the user's connected app data. Be extremely brief — short punchy sentences, no filler.
Rules:
- Use ONLY the provided data. Never invent senders, times, counts, or content.
- Ignore newsletters, spam, advertisements, promotions, and automated/no-reply notification emails.
- Focus on meetings, deadlines, pending replies, action items, commitments, requests, and urgent conversations.
- Respond with a single JSON object and nothing else, matching exactly:
{"importantCount":<int>,"followUpCount":<int>,"brief":[{"text":<string>,"apps":[${sourceList},...]}],"priorityItems":[{"source":${sourceList},"title":<string>,"description":<string>,"priority":"low"|"medium"|"high","timestamp":<ISO 8601 string>,"ref":<string>}]}
- Data notes: ${promptHints.join(" ")}
- brief: 2-3 short one-sentence summaries (max 90 characters each) of the most notable items or themes, each tagged with its source app(s). Name the key sender or topic. End with ONE extra action-focused entry tagged with apps:[] — the single most important thing the user should do today, phrased as an imperative.
- priorityItems: the top 3 most urgent items, most urgent first. title <= 60 chars; description <= 100 chars with the key fact (who/what) and why it needs attention; timestamp = the underlying item's own timestamp copied verbatim; ref = the underlying item's "ref" value copied EXACTLY, character for character — required whenever the source item has a "ref" field; omit only when it truly has none.
- importantCount = number of distinct items in the data that plausibly need the user's attention today.
- followUpCount = number of items clearly waiting on the user's reply (e.g. aging emails, unanswered chats).`;
}

/** Some models wrap JSON in markdown fences despite instructions. */
function stripFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
}

async function chatCompletion(
  systemPrompt: string,
  payload: AiSourcePayload,
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
        { role: "system", content: systemPrompt },
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
 * Generates the AI subset of the dashboard from the bounded source data.
 * Throws on any failure (missing key, HTTP error, timeout, unparseable
 * output) — the caller falls back to a mechanical brief; never invents data.
 */
export async function generateAiBrief(
  payload: AiSourcePayload,
  promptHints: string[],
): Promise<AiBrief> {
  if (!aiConfigured()) throw new AiNotConfiguredError();
  const systemPrompt = buildSystemPrompt(payload.sources, promptHints);

  // Providers without response_format support reject the request with 400;
  // retry once relying on the prompt alone (sanitizeAiBrief guards the shape).
  let res = await chatCompletion(systemPrompt, payload, true);
  if (res.status === 400) res = await chatCompletion(systemPrompt, payload, false);
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
  const brief = sanitizeAiBrief(parsed, payload.sources);
  if (!brief) throw new Error("AI response did not match the brief shape.");
  return brief;
}
