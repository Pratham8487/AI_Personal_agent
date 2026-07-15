import { apiFetch } from "./auth-client";
import type { EmailSummary } from "@/lib/server/gmail-api";

export type { EmailSummary };

export type GmailProfile = { emailAddress: string; messagesTotal: number };

export type GmailMcpCall = { name: string; args?: Record<string, unknown> };

export type GmailMcpResult = {
  ok: boolean;
  message: string;
  structured: unknown;
};

type JsonRpcResponse = {
  id?: number | string | null;
  result?: {
    content?: { type: string; text?: string }[];
    structuredContent?: unknown;
    isError?: boolean;
  };
  error?: { message?: string };
};

const GENERIC_ERROR = "Could not load Gmail data. Please retry.";

/** Runs several Gmail MCP tools in one JSON-RPC batch POST. */
export async function callGmailMcpBatch(
  userId: string,
  calls: GmailMcpCall[],
): Promise<GmailMcpResult[]> {
  const batch = calls.map((call, index) => ({
    jsonrpc: "2.0",
    id: index + 1,
    method: "tools/call",
    params: { name: call.name, arguments: call.args ?? {} },
  }));
  const res = await apiFetch(`/api/integrations/gmail/mcp?uid=${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  });
  const body = (await res.json().catch(() => null)) as JsonRpcResponse[] | null;
  if (!res.ok || !Array.isArray(body)) {
    throw new Error(GENERIC_ERROR);
  }

  const byId = new Map(body.map((response) => [response.id, response]));
  return calls.map((_, index) => {
    const response = byId.get(index + 1);
    if (!response || response.error || !response.result) {
      return {
        ok: false,
        message: response?.error?.message ?? GENERIC_ERROR,
        structured: null,
      };
    }
    const text =
      response.result.content?.find((c) => c.type === "text")?.text ?? "";
    if (response.result.isError) {
      return { ok: false, message: text || GENERIC_ERROR, structured: null };
    }
    return {
      ok: true,
      message: text,
      structured: response.result.structuredContent ?? null,
    };
  });
}

/** Narrows the structuredContent of read_emails / search_inbox. */
export function parseMessages(structured: unknown): EmailSummary[] | null {
  if (!structured || typeof structured !== "object") return null;
  const messages = (structured as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return null;
  return messages.filter(
    (m): m is EmailSummary =>
      !!m &&
      typeof m === "object" &&
      typeof (m as EmailSummary).from === "string" &&
      typeof (m as EmailSummary).subject === "string" &&
      typeof (m as EmailSummary).date === "string" &&
      typeof (m as EmailSummary).snippet === "string",
  );
}

/** Narrows the structuredContent of get_labels. */
export function parseLabels(structured: unknown): string[] | null {
  if (!structured || typeof structured !== "object") return null;
  const labels = (structured as { labels?: unknown }).labels;
  if (!Array.isArray(labels)) return null;
  return labels.filter((l): l is string => typeof l === "string");
}

export type CountStat = { count: number; capped: boolean };

/** Narrows the structuredContent of count_messages. */
export function parseCountResult(structured: unknown): CountStat | null {
  if (!structured || typeof structured !== "object") return null;
  const { count, capped } = structured as { count?: unknown; capped?: unknown };
  if (typeof count !== "number") return null;
  return { count, capped: capped === true };
}

/** "1,000+" when the count hit the server cap, else the plain number. */
export function formatCountStat(stat: CountStat): string {
  return `${stat.count.toLocaleString("en-US")}${stat.capped ? "+" : ""}`;
}

/** Narrows the structuredContent of get_profile. */
export function parseProfile(structured: unknown): GmailProfile | null {
  if (!structured || typeof structured !== "object") return null;
  const { emailAddress, messagesTotal } = structured as Partial<GmailProfile>;
  if (typeof emailAddress !== "string" || typeof messagesTotal !== "number") {
    return null;
  }
  return { emailAddress, messagesTotal };
}
