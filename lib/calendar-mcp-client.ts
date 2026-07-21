import { apiFetch } from "./auth-client";

/**
 * Browser client for /api/integrations/google-calendar/mcp, which proxies
 * Google's official Calendar MCP server. Shapes below mirror that server's
 * published outputSchema — nothing here defines the tools themselves.
 */

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

export type McpResult = {
  ok: boolean;
  message: string;
  structured: Record<string, unknown> | null;
};

type JsonRpcResponse = {
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

const ENDPOINT = "/api/integrations/google-calendar/mcp";
const GENERIC_ERROR = "Could not load Google Calendar data. Please retry.";

async function rpc(body: unknown): Promise<JsonRpcResponse | null> {
  const res = await apiFetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => null)) as JsonRpcResponse | null;
  if (!res.ok && !parsed) return null;
  return parsed;
}

/** The live catalog from Google, via the proxy (tools/list). */
export async function listCalendarTools(): Promise<McpTool[]> {
  const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  if (!response?.result?.tools) {
    throw new Error(response?.error?.message ?? "Could not load MCP tools.");
  }
  return response.result.tools;
}

/** Which path executes tool calls: Google's server, or the REST fallback. */
export type CalendarTransport = "mcp" | "rest" | "unknown";

export async function getCalendarTransport(): Promise<CalendarTransport> {
  const response = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {} },
  });
  const transport = response?.result?.serverInfo?.transport;
  return transport === "mcp" || transport === "rest" ? transport : "unknown";
}

/** Runs one Calendar tool and normalizes the JSON-RPC reply. */
export async function callCalendarTool(
  name: string,
  args: Record<string, unknown>,
): Promise<McpResult> {
  const response = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  if (!response || response.error || !response.result) {
    return {
      ok: false,
      message: response?.error?.message ?? GENERIC_ERROR,
      structured: null,
    };
  }
  const text =
    response.result.content?.find((part) => part.type === "text")?.text ?? "";
  if (response.result.isError) {
    return { ok: false, message: text || GENERIC_ERROR, structured: null };
  }
  return {
    ok: true,
    message: text,
    structured: response.result.structuredContent ?? null,
  };
}

/** A date or date-time, per the server's DateOrDateTime definition. */
export type CalendarDate = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type CalendarAttendee = {
  email?: string;
  displayName?: string;
  responseStatus?: string;
  organizer?: boolean;
  self?: boolean;
  optionalAttendee?: boolean;
};

export type CalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: CalendarDate;
  end?: CalendarDate;
  attendees?: CalendarAttendee[];
  htmlLink?: string;
  conferenceUrl?: string;
  recurrence?: string[];
  recurringEventId?: string;
  eventType?: string;
  status?: string;
};

export type CalendarListItem = {
  id?: string;
  summary?: string;
  description?: string;
  timeZone?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Narrows list_events / search_events output. */
export function parseEvents(
  structured: Record<string, unknown> | null,
): CalendarEvent[] | null {
  if (!structured || !Array.isArray(structured.events)) return null;
  return structured.events.filter(isRecord) as CalendarEvent[];
}

/** Narrows get_event output — the event sits at the top level. */
export function parseEvent(
  structured: Record<string, unknown> | null,
): CalendarEvent | null {
  if (!structured) return null;
  const event = isRecord(structured.event) ? structured.event : structured;
  return typeof event.summary === "string" || typeof event.id === "string"
    ? (event as CalendarEvent)
    : null;
}

/** Narrows list_calendars output. */
export function parseCalendars(
  structured: Record<string, unknown> | null,
): CalendarListItem[] | null {
  if (!structured || !Array.isArray(structured.calendars)) return null;
  return structured.calendars.filter(isRecord) as CalendarListItem[];
}

/** "Mon, Jul 21, 09:00" — or a date-only label for all-day events. */
export function formatEventTime(value: CalendarDate | undefined): string {
  if (!value) return "";
  const raw = value.dateTime ?? value.date;
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  if (!value.dateTime) {
    return parsed.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  return parsed.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
