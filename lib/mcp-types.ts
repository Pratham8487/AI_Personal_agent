import { apiFetch } from "./auth-client";

/**
 * Provider-neutral MCP shapes and browser transport, shared by every in-app
 * MCP client (Google Calendar, Outlook).
 *
 * These mirror the MCP spec, not any one server: tool definitions are whatever
 * the upstream server publishes, so nothing here describes a specific tool.
 */

export type JsonSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  format?: string;
  deprecated?: boolean;
};

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  };
};

export type McpResult = {
  ok: boolean;
  message: string;
  structured: Record<string, unknown> | null;
};

export type JsonRpcResponse = {
  id?: number | string | null;
  result?: {
    content?: { type: string; text?: string }[];
    structuredContent?: Record<string, unknown>;
    tools?: McpTool[];
    serverInfo?: { transport?: string };
    isError?: boolean;
  };
  error?: { message?: string };
};

/** Posts one JSON-RPC message to an in-app MCP proxy route. */
export async function mcpRpc(
  endpoint: string,
  body: unknown,
): Promise<JsonRpcResponse | null> {
  const res = await apiFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => null)) as JsonRpcResponse | null;
  if (!res.ok && !parsed) return null;
  return parsed;
}

/** The live catalog from the upstream server, via our proxy (tools/list). */
export async function fetchMcpTools(endpoint: string): Promise<McpTool[]> {
  const response = await mcpRpc(endpoint, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  });
  if (!response?.result?.tools) {
    throw new Error(response?.error?.message ?? "Could not load MCP tools.");
  }
  return response.result.tools;
}

/** Runs one tool and normalizes the JSON-RPC reply into an McpResult. */
export async function runMcpTool(
  endpoint: string,
  name: string,
  args: Record<string, unknown>,
  genericError: string,
): Promise<McpResult> {
  const response = await mcpRpc(endpoint, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  if (!response || response.error || !response.result) {
    return {
      ok: false,
      message: response?.error?.message ?? genericError,
      structured: null,
    };
  }
  const text =
    response.result.content?.find((part) => part.type === "text")?.text ?? "";
  if (response.result.isError) {
    return { ok: false, message: text || genericError, structured: null };
  }
  return {
    ok: true,
    message: text,
    structured: response.result.structuredContent ?? null,
  };
}
