import { apiFetch } from "./auth-client";

export type WhatsappMcpCall = { name: string; args?: Record<string, unknown> };

export type WhatsappMcpResult = {
  ok: boolean;
  message: string;
  structured: unknown;
};

export type WaMessage = {
  chatJid: string;
  chatName: string | null;
  sender: string | null;
  fromMe: boolean;
  text: string | null;
  sentAt: string;
};

export type WaChat = {
  jid: string;
  name: string | null;
  participants?: number | null;
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

const GENERIC_ERROR = "Could not load WhatsApp data. Please retry.";

/** Runs several WhatsApp MCP tools in one JSON-RPC batch POST. */
export async function callWhatsappMcpBatch(
  userId: string,
  calls: WhatsappMcpCall[],
): Promise<WhatsappMcpResult[]> {
  const batch = calls.map((call, index) => ({
    jsonrpc: "2.0",
    id: index + 1,
    method: "tools/call",
    params: { name: call.name, arguments: call.args ?? {} },
  }));
  const res = await apiFetch(`/api/integrations/whatsapp/mcp?uid=${userId}`, {
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

/** Narrows the structuredContent of the message-returning tools. */
export function parseWaMessages(structured: unknown): WaMessage[] | null {
  if (!structured || typeof structured !== "object") return null;
  const messages = (structured as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return null;
  return messages.filter(
    (m): m is WaMessage =>
      !!m &&
      typeof m === "object" &&
      typeof (m as WaMessage).chatJid === "string" &&
      typeof (m as WaMessage).sentAt === "string",
  );
}

/** Narrows the structuredContent of search_chats / list_groups. */
export function parseWaChats(structured: unknown): WaChat[] | null {
  if (!structured || typeof structured !== "object") return null;
  const chats = (structured as { chats?: unknown }).chats;
  if (!Array.isArray(chats)) return null;
  return chats.filter(
    (c): c is WaChat =>
      !!c && typeof c === "object" && typeof (c as WaChat).jid === "string",
  );
}
