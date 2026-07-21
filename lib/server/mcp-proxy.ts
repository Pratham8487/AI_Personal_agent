import { getSessionUser } from "./session";
import type { McpToolDefinition } from "./mcp-http";

/**
 * Builds an MCP server (Streamable HTTP, stateless) that fronts a remote MCP
 * server for the signed-in user, authenticated by the session cookie.
 *
 * These are proxies, not implementations: tools/list and tools/call are
 * forwarded upstream with the user's OAuth token attached, so each catalog is
 * always whatever the provider actually serves. Adding a provider means one
 * call to this factory — the JSON-RPC envelope, batching, notification
 * handling and error mapping are identical for all of them.
 */

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type JsonRpcId = string | number | null;

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

export type ProxyToolResult = {
  text: string;
  structured?: Record<string, unknown>;
};

export type McpProxyConfig = {
  /** Reported as serverInfo.name. */
  serverName: string;
  listTools: (userId: string) => Promise<readonly McpToolDefinition[]>;
  callTool: (
    userId: string,
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ProxyToolResult>;
  /**
   * Error types whose message is safe and useful to show the user (bad
   * arguments, unknown tool, "reconnect this integration"). Anything else is
   * logged and replaced with `genericError`.
   */
  userFacingErrors: readonly (new (...args: never[]) => Error)[];
  /** Shown when a tool fails for a reason the user cannot act on. */
  genericError: string;
  /** Shown when the catalog cannot be loaded. */
  catalogError: string;
  /** Extra serverInfo fields, e.g. which transport actually served the user. */
  serverInfo?: (userId: string) => Record<string, unknown>;
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

export function createMcpProxy(config: McpProxyConfig) {
  const isUserFacing = (error: unknown) =>
    config.userFacingErrors.some((type) => error instanceof type);

  async function handleToolsList(uid: string, id: JsonRpcId) {
    try {
      return rpcResult(id, { tools: await config.listTools(uid) });
    } catch (error) {
      if (isUserFacing(error)) {
        return rpcError(id, -32603, (error as Error).message);
      }
      console.error(`${config.serverName} tools/list failed:`, error);
      return rpcError(id, -32603, config.catalogError);
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
      const { text, structured } = await config.callTool(uid, name, args);
      return rpcResult(id, toolText(text, false, structured));
    } catch (error) {
      if (isUserFacing(error)) {
        return rpcResult(id, toolText((error as Error).message, true));
      }
      console.error(`${config.serverName} tool failed (${name}):`, error);
      return rpcResult(id, toolText(config.genericError, true));
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
            name: config.serverName,
            version: "1.0.0",
            ...(config.serverInfo?.(uid) ?? {}),
          },
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return handleToolsList(uid, id);
      case "tools/call":
        return handleToolCall(uid, id, params);
      default:
        return rpcError(id, -32601, `Method not found: ${message.method}`);
    }
  }

  async function POST(request: Request) {
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
  function GET() {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  return { POST, GET };
}
