import {
  GMAIL_MCP_TOOLS,
  InvalidToolArgsError,
  UnknownToolError,
  callGmailTool,
} from "@/lib/server/gmail-mcp";
import {
  GmailNotConfiguredError,
  GmailNotConnectedError,
  isUuid,
} from "@/lib/server/gmail-oauth";

/**
 * MCP server (Streamable HTTP, stateless) exposing the user's Gmail
 * connection. Point any MCP client at:
 *
 *   POST /api/integrations/gmail/mcp?uid=<user-uuid>
 */

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type JsonRpcId = string | number | null;

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolText(
  text: string,
  isError = false,
  structured?: Record<string, unknown>,
) {
  return {
    content: [{ type: "text", text }],
    ...(structured ? { structuredContent: structured } : {}),
    ...(isError ? { isError } : {}),
  };
}

async function handleToolCall(
  uid: string,
  id: JsonRpcId,
  params: Record<string, unknown>,
) {
  const name = typeof params.name === "string" ? params.name : "";
  const args =
    params.arguments && typeof params.arguments === "object"
      ? (params.arguments as Record<string, unknown>)
      : {};
  try {
    const { text, structured } = await callGmailTool(uid, name, args);
    return rpcResult(id, toolText(text, false, structured));
  } catch (error) {
    if (error instanceof UnknownToolError || error instanceof InvalidToolArgsError) {
      return rpcError(id, -32602, error.message);
    }
    if (
      error instanceof GmailNotConfiguredError ||
      error instanceof GmailNotConnectedError
    ) {
      return rpcResult(id, toolText(error.message, true));
    }
    console.error(`Gmail MCP tool failed (${name}):`, error);
    return rpcResult(id, toolText("Could not reach Gmail. Please retry.", true));
  }
}

/** Handles one JSON-RPC message; returns null for notifications. */
async function handleMessage(uid: string, message: JsonRpcMessage) {
  const id = message.id ?? null;
  const isRequest = message.id !== undefined;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return isRequest ? rpcError(id, -32600, "Invalid request.") : null;
  }
  if (message.method.startsWith("notifications/")) return null;

  const params = message.params ?? {};
  switch (message.method) {
    case "initialize": {
      const requested = params.protocolVersion;
      const protocolVersion =
        typeof requested === "string" &&
        SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "gmail-mcp", version: "1.0.0" },
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: GMAIL_MCP_TOOLS });
    case "tools/call":
      return handleToolCall(uid, id, params);
    default:
      return rpcError(id, -32601, `Method not found: ${message.method}`);
  }
}

export async function POST(request: Request) {
  const uid = new URL(request.url).searchParams.get("uid") ?? "";
  if (!isUuid(uid)) {
    return Response.json(rpcError(null, -32000, "Invalid or missing uid."), {
      status: 400,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error."), {
      status: 400,
    });
  }

  const messages = (Array.isArray(body) ? body : [body]) as JsonRpcMessage[];
  const responses = [];
  for (const message of messages) {
    const response = await handleMessage(uid, message);
    if (response) responses.push(response);
  }

  // Notifications only: acknowledge with no body, per the MCP spec.
  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}

/** No server-initiated stream in stateless mode. */
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
