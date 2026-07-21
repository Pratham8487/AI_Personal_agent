/**
 * Streamable-HTTP MCP transport shared by every remote MCP server we talk to
 * (Google Calendar, Microsoft Work IQ).
 *
 * Transport only: nothing here knows a tool name, a provider, or an OAuth
 * scheme. Callers supply the endpoint, an optional bearer token, and how to
 * describe an auth failure in their own terms.
 */

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  result?: {
    tools?: McpToolDefinition[];
    content?: { type: string; text?: string }[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    protocolVersion?: string;
  };
  error?: { code?: number; message?: string };
};

export class McpTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpTransportError";
  }
}

/** Header carrying the server-assigned session id, per the MCP spec. */
const SESSION_HEADER = "mcp-session-id";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

/**
 * Servers answer with either application/json or an SSE stream, depending on
 * the tool. For SSE, the last `data:` frame carries the JSON-RPC response.
 */
export async function readJsonRpc(
  res: Response,
  label: string,
): Promise<JsonRpcResponse> {
  const body = await res.text();
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    let last: JsonRpcResponse | null = null;
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        last = JSON.parse(payload) as JsonRpcResponse;
      } catch {
        // Ignore keep-alive or partial frames.
      }
    }
    if (!last) throw new McpTransportError(`Malformed response from ${label}.`);
    return last;
  }

  try {
    return JSON.parse(body) as JsonRpcResponse;
  } catch {
    throw new McpTransportError(`Malformed response from ${label}.`);
  }
}

export type PostOptions = {
  endpoint: string;
  message: Record<string, unknown>;
  accessToken?: string;
  /** Echoed back to the server once it has assigned one. */
  sessionId?: string | null;
  /** Human name for this server, used in transport error messages. */
  label: string;
  /** Builds the error thrown on 401/403 in the caller's own vocabulary. */
  onUnauthorized: () => Error;
};

export type PostResult = {
  response: JsonRpcResponse;
  /** Present when the server issued or rotated a session id. */
  sessionId: string | null;
  /** The session was rejected; the caller should re-handshake and retry. */
  sessionExpired: boolean;
};

/** Posts one JSON-RPC message and normalizes the reply. */
export async function postJsonRpc(options: PostOptions): Promise<PostResult> {
  const { endpoint, message, accessToken, sessionId, label, onUnauthorized } =
    options;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...message }),
  });

  if (res.status === 401 || res.status === 403) throw onUnauthorized();

  // A stale session id is reported as 404; the caller re-initializes.
  if (res.status === 404 && sessionId) {
    return { response: {}, sessionId: null, sessionExpired: true };
  }
  if (!res.ok && res.status >= 500) {
    throw new McpTransportError(`${label} is unavailable. Please retry.`);
  }

  return {
    response: await readJsonRpc(res, label),
    sessionId: res.headers.get(SESSION_HEADER),
    sessionExpired: false,
  };
}

/**
 * Performs the MCP `initialize` handshake and returns the session id the
 * server assigned, if any. Servers that run stateless (Google's does) simply
 * omit the header, and null flows harmlessly through postJsonRpc.
 */
export async function initializeSession(
  options: Omit<PostOptions, "message" | "sessionId">,
): Promise<string | null> {
  const { sessionId } = await postJsonRpc({
    ...options,
    message: {
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "aster", version: "1.0.0" },
      },
    },
  });

  if (sessionId) {
    // Notifications carry no id and expect no reply; failure is not fatal.
    await fetch(options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        ...(options.accessToken
          ? { Authorization: `Bearer ${options.accessToken}` }
          : {}),
        "Mcp-Session-Id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    }).catch(() => {});
  }
  return sessionId;
}
