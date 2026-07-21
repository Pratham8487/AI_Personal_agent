import { fetchMcpTools, runMcpTool } from "./mcp-types";

/**
 * Browser client for /api/integrations/outlook/mcp, which proxies Microsoft's
 * official Work IQ MCP servers (Mail, Calendar, and the universal server).
 *
 * The parsers below narrow Microsoft Graph payloads for display only. Nothing
 * here defines a tool: the catalog, arguments and result shapes are all
 * Microsoft's, fetched live.
 */

import type { McpTool } from "./mcp-types";

export type { JsonSchema, McpResult, McpTool } from "./mcp-types";

const ENDPOINT = "/api/integrations/outlook/mcp";
const GENERIC_ERROR = "Could not load Outlook data. Please retry.";

/** Which Work IQ server served this tool, for the Settings grouping. */
export type OutlookResource = "mail" | "calendar" | "workiq";

export type OutlookTool = McpTool & { resource?: OutlookResource };

export async function listOutlookTools(): Promise<OutlookTool[]> {
  return (await fetchMcpTools(ENDPOINT)) as OutlookTool[];
}

export function callOutlookTool(
  name: string,
  args: Record<string, unknown>,
) {
  return runMcpTool(ENDPOINT, name, args, GENERIC_ERROR);
}

// --- Microsoft Graph shapes -------------------------------------------------

export type GraphRecipient = {
  emailAddress?: { name?: string; address?: string };
};

export type GraphMessage = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  from?: GraphRecipient;
  sender?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  importance?: string;
  webLink?: string;
};

export type GraphDateTime = { dateTime?: string; timeZone?: string };

export type GraphEvent = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  start?: GraphDateTime;
  end?: GraphDateTime;
  location?: { displayName?: string };
  organizer?: GraphRecipient;
  attendees?: { emailAddress?: { name?: string; address?: string }; status?: { response?: string } }[];
  isAllDay?: boolean;
  isCancelled?: boolean;
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string };
  recurrence?: Record<string, unknown> | null;
  seriesMasterId?: string;
  type?: string;
  webLink?: string;
};

export type GraphNamedItem = {
  id?: string;
  displayName?: string;
  name?: string;
  totalItemCount?: number;
  unreadItemCount?: number;
  contentType?: string;
  size?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Graph collections arrive under `value`; different Work IQ tools wrap that in
 * different keys, so the first array of objects found is used.
 */
function collection(
  structured: Record<string, unknown> | null,
): Record<string, unknown>[] | null {
  if (!structured) return null;
  for (const key of ["value", "messages", "events", "items", "results"]) {
    const candidate = structured[key];
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return null;
}

/** A single entity may sit at the top level or under a wrapper key. */
function entity(
  structured: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown> | null {
  if (!structured) return null;
  for (const key of keys) {
    if (isRecord(structured[key])) return structured[key];
  }
  return structured;
}

function looksLikeMessage(value: Record<string, unknown>): boolean {
  return (
    "bodyPreview" in value ||
    "receivedDateTime" in value ||
    "toRecipients" in value ||
    ("subject" in value && ("from" in value || "sender" in value || "isRead" in value))
  );
}

function looksLikeEvent(value: Record<string, unknown>): boolean {
  return "start" in value && "end" in value;
}

export function parseMessages(
  structured: Record<string, unknown> | null,
): GraphMessage[] | null {
  const items = collection(structured);
  if (!items?.length) return null;
  return items.some(looksLikeMessage) ? (items as GraphMessage[]) : null;
}

export function parseEvents(
  structured: Record<string, unknown> | null,
): GraphEvent[] | null {
  const items = collection(structured);
  if (!items?.length) return null;
  return items.some(looksLikeEvent) ? (items as GraphEvent[]) : null;
}

export function parseMessage(
  structured: Record<string, unknown> | null,
): GraphMessage | null {
  const value = entity(structured, ["message", "value"]);
  return value && looksLikeMessage(value) ? (value as GraphMessage) : null;
}

export function parseEvent(
  structured: Record<string, unknown> | null,
): GraphEvent | null {
  const value = entity(structured, ["event", "value"]);
  return value && looksLikeEvent(value) ? (value as GraphEvent) : null;
}

/** Folders, calendars and attachments all render as a simple named list. */
export function parseNamedItems(
  structured: Record<string, unknown> | null,
): GraphNamedItem[] | null {
  const items = collection(structured);
  if (!items?.length) return null;
  return items.every((item) => "displayName" in item || "name" in item)
    ? (items as GraphNamedItem[])
    : null;
}

export function recipientLabel(recipient: GraphRecipient | undefined): string {
  const address = recipient?.emailAddress;
  if (!address) return "";
  return address.name || address.address || "";
}

/** True for an occurrence of, or the master of, a recurring series. */
export function isRecurringEvent(event: GraphEvent): boolean {
  return Boolean(
    event.recurrence ||
      event.seriesMasterId ||
      event.type === "occurrence" ||
      event.type === "seriesMaster" ||
      event.type === "exception",
  );
}

const HAS_OFFSET = /[Zz]|[+-]\d{2}:?\d{2}$/;

/**
 * "Mon, Jul 21, 09:00" — or a date-only label for all-day events.
 *
 * Graph splits an instant into a zone-less `dateTime` plus a separate
 * `timeZone`, and defaults that zone to UTC. Only a value we know to be UTC is
 * converted into the viewer's zone; a named zone is shown as the wall time it
 * literally is, because converting it would need that zone's offset on that
 * date, which the payload does not carry.
 */
export function formatGraphTime(
  value: GraphDateTime | string | undefined,
  allDay = false,
): string {
  const raw = typeof value === "string" ? value : value?.dateTime;
  if (!raw) return "";
  const zone = typeof value === "string" ? undefined : value?.timeZone;
  const isUtc = HAS_OFFSET.test(raw) || !zone || zone.toUpperCase() === "UTC";

  const parsed = new Date(HAS_OFFSET.test(raw) ? raw : `${raw}Z`);
  if (Number.isNaN(parsed.getTime())) return raw;

  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }),
  };
  // Reading the UTC fields back renders the wall time unshifted.
  if (!isUtc) {
    return `${parsed.toLocaleString(undefined, { ...dateOptions, timeZone: "UTC" })} (${zone})`;
  }
  return parsed.toLocaleString(undefined, dateOptions);
}
