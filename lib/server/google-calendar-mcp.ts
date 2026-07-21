import {
  callCalendarToolViaRest,
  restToolSupported,
} from "./google-calendar-rest";
import {
  GoogleNotConnectedError,
  getValidAccessToken,
} from "./google-oauth";

/**
 * Client for Google's official Calendar MCP server.
 *
 *   endpoint  https://calendarmcp.googleapis.com/mcp/v1
 *   transport JSON-RPC 2.0 over streamable HTTP
 *   auth      Authorization: Bearer <google access token>
 *
 * The tool catalog always comes from that server — tools/list needs no
 * credentials — so tool names, descriptions and JSON Schemas are Google's own
 * and are never hardcoded here.
 *
 * Execution is MCP-first with a REST fallback. The remote server is in
 * Developer Preview and only serves Google Workspace accounts enrolled in the
 * programme; for everyone else every tools/call answers PERMISSION_DENIED. So
 * a denial falls through to google-calendar-rest.ts, which runs the same tool
 * against the Calendar REST API and returns the same shapes. Callers cannot
 * tell the difference, and eligible accounts transparently use real MCP.
 *
 * Requires calendarmcp.googleapis.com (and calendar-json.googleapis.com) to be
 * enabled in the Cloud project that owns GOOGLE_CLIENT_ID.
 */

const ENDPOINT = "https://calendarmcp.googleapis.com/mcp/v1";

/** tools/list needs no credentials, so one catalog serves every user. */
const CATALOG_TTL_MS = 60 * 60 * 1000;

/**
 * How long a PERMISSION_DENIED verdict is trusted before the remote server is
 * retried. Eligibility changes rarely (it needs a Workspace account and
 * programme approval), so this only costs one wasted round trip per hour.
 */
const DENIED_TTL_MS = 60 * 60 * 1000;

export class CalendarMcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarMcpError";
  }
}

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
};

type JsonRpcResponse = {
  result?: {
    tools?: McpToolDefinition[];
    content?: { type: string; text?: string }[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
  error?: { message?: string };
};

/**
 * Google answers with either application/json or an SSE stream, depending on
 * the tool. For SSE, the last `data:` frame carries the JSON-RPC response.
 */
async function readJsonRpc(res: Response): Promise<JsonRpcResponse> {
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
    if (!last) throw new CalendarMcpError("Malformed response from Google Calendar.");
    return last;
  }

  try {
    return JSON.parse(body) as JsonRpcResponse;
  } catch {
    throw new CalendarMcpError("Malformed response from Google Calendar.");
  }
}

async function post(
  message: Record<string, unknown>,
  accessToken?: string,
): Promise<JsonRpcResponse> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...message }),
  });

  // Auth failures still carry a JSON-RPC body, so parse before branching.
  if (res.status === 401 || res.status === 403) {
    throw new GoogleNotConnectedError(
      "Google Calendar access has expired. Reconnect it from the Integrations page.",
    );
  }
  if (!res.ok && res.status >= 500) {
    throw new CalendarMcpError("Google Calendar is unavailable. Please retry.");
  }
  return readJsonRpc(res);
}

let catalog: { tools: McpToolDefinition[]; fetchedAt: number } | null = null;
let inFlight: Promise<McpToolDefinition[]> | null = null;

/**
 * The live tool catalog, straight from Google — never hardcoded, so tools the
 * server adds or changes show up on their own. Cached because the response is
 * user-independent; a stale cache is refreshed after CATALOG_TTL_MS.
 */
export async function listCalendarTools(): Promise<McpToolDefinition[]> {
  if (catalog && Date.now() - catalog.fetchedAt < CATALOG_TTL_MS) {
    return catalog.tools;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const response = await post({ method: "tools/list" });
    if (response.error || !response.result?.tools) {
      throw new CalendarMcpError(
        response.error?.message ?? "Could not load Google Calendar tools.",
      );
    }
    const tools = response.result.tools;
    catalog = { tools, fetchedAt: Date.now() };
    return tools;
  })();

  try {
    return await inFlight;
  } catch (error) {
    // Serve a stale catalog rather than an empty tool list.
    if (catalog) return catalog.tools;
    throw error;
  } finally {
    inFlight = null;
  }
}

export type CalendarToolResult = {
  text: string;
  structured?: Record<string, unknown>;
};

/** Google reports preview ineligibility as a plain PERMISSION_DENIED. */
function isPermissionDenied(message: string): boolean {
  return /does not have permission|permission_denied|insufficient/i.test(message);
}

export type CalendarTransport = "mcp" | "rest" | "unknown";

/**
 * Eligibility is a property of the user's Google account, not of the
 * deployment, so both caches are keyed by user: one consumer account must
 * never push a Workspace colleague onto the fallback. Bounded so a long-lived
 * process cannot accumulate an entry per user forever.
 */
const MAX_TRACKED_USERS = 500;

const deniedUntil = new Map<string, number>();
const lastTransport = new Map<string, CalendarTransport>();

function remember<T>(cache: Map<string, T>, userId: string, value: T): void {
  // Map preserves insertion order, so the first key is the oldest.
  if (!cache.has(userId) && cache.size >= MAX_TRACKED_USERS) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(userId, value);
}

/** True while the remote server is known to reject this user's calls. */
function remoteDenied(userId: string): boolean {
  const until = deniedUntil.get(userId);
  return until !== undefined && Date.now() < until;
}

/**
 * Which path last served this user's tool calls — "unknown" until one has run.
 * Surfaced in the Settings dialog so it is obvious whether the official server
 * is doing the work, and when an account becomes eligible for it.
 */
export function calendarTransport(userId: string): CalendarTransport {
  if (remoteDenied(userId)) return "rest";
  return lastTransport.get(userId) ?? "unknown";
}

/** Attempts the remote server; returns null when it declines to serve us. */
async function callRemote(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<CalendarToolResult | null> {
  const accessToken = await getValidAccessToken(userId);
  const response = await post(
    { method: "tools/call", params: { name, arguments: args } },
    accessToken,
  );

  if (response.error) {
    if (isPermissionDenied(response.error.message ?? "")) return null;
    throw new CalendarMcpError(
      response.error.message ?? "Google Calendar rejected the request.",
    );
  }
  const result = response.result;
  if (!result) throw new CalendarMcpError("Empty response from Google Calendar.");

  const text = result.content?.find((part) => part.type === "text")?.text ?? "";
  if (result.isError) {
    if (isPermissionDenied(text)) return null;
    throw new CalendarMcpError(text || "Google Calendar could not run that tool.");
  }
  return { text, structured: result.structuredContent };
}

/**
 * Runs one Calendar tool as the user. Mirrors callGmailTool's return shape so
 * the agent bridge and dashboard provider treat both providers identically.
 */
export async function callCalendarTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<CalendarToolResult> {
  if (!remoteDenied(userId)) {
    try {
      const result = await callRemote(userId, name, args);
      if (result) {
        remember(lastTransport, userId, "mcp");
        return result;
      }
      remember(deniedUntil, userId, Date.now() + DENIED_TTL_MS);
      console.warn(
        "Calendar MCP server denied this account (Workspace preview only); " +
          "serving Calendar tools over the REST API instead.",
      );
    } catch (error) {
      // A connection problem shouldn't strand the user when REST can serve
      // them; anything else (bad arguments, unknown tool) is a real answer.
      if (error instanceof GoogleNotConnectedError) throw error;
      if (!restToolSupported(name)) throw error;
      console.error(`Calendar MCP call failed (${name}); falling back:`, error);
    }
  }
  const result = await callCalendarToolViaRest(userId, name, args);
  remember(lastTransport, userId, "rest");
  return result;
}
