import {
  CalendarMcpError,
  calendarTransport,
  callCalendarTool,
  listCalendarTools,
} from "@/lib/server/google-calendar-mcp";
import { CalendarRestError } from "@/lib/server/google-calendar-rest";
import {
  GoogleNotConfiguredError,
  GoogleNotConnectedError,
} from "@/lib/server/google-oauth";
import { getSessionUser } from "@/lib/server/session";

/**
 * MCP server (Streamable HTTP, stateless) fronting Google's official Calendar
 * MCP server for the signed-in user. Authenticated by the session cookie:
 *
 *   POST /api/integrations/google-calendar/mcp
 *
 * This is a proxy, not an implementation: tools/list and tools/call are
 * forwarded upstream with the user's OAuth token attached, so the catalog is
 * always whatever Google actually serves.
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

async function handleToolsList(id: JsonRpcId) {
  try {
    return rpcResult(id, { tools: await listCalendarTools() });
  } catch (error) {
    console.error("Calendar MCP tools/list failed:", error);
    return rpcError(id, -32603, "Could not load Google Calendar tools.");
  }
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
    const { text, structured } = await callCalendarTool(uid, name, args);
    return rpcResult(id, toolText(text, false, structured));
  } catch (error) {
    if (
      error instanceof GoogleNotConfiguredError ||
      error instanceof GoogleNotConnectedError ||
      // Upstream messages are user-facing (bad arguments, unknown tool, …).
      error instanceof CalendarMcpError ||
      error instanceof CalendarRestError
    ) {
      return rpcResult(id, toolText(error.message, true));
    }
    console.error(`Calendar MCP tool failed (${name}):`, error);
    return rpcResult(
      id,
      toolText("Could not reach Google Calendar. Please retry.", true),
    );
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
        serverInfo: {
          name: "google-calendar-mcp-proxy",
          version: "1.0.0",
          // Which path last executed a tool for this user: the official remote
          // server, or the local REST executor it falls back to.
          transport: calendarTransport(uid),
        },
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return handleToolsList(id);
    case "tools/call":
      return handleToolCall(uid, id, params);
    default:
      return rpcError(id, -32601, `Method not found: ${message.method}`);
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(rpcError(null, -32000, "Not signed in."), {
      status: 401,
    });
  }
  const uid = user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error."), {
      status: 400,
    });
  }

  // Clients may batch; MCP 2025-06-18 dropped JSON-RPC batching, so each
  // message is forwarded upstream on its own and the replies re-assembled.
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
