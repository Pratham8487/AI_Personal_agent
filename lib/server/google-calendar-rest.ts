import { getValidAccessToken } from "./google-oauth";

/**
 * Local executor for the official Calendar MCP tools.
 *
 * Google's remote MCP server (calendarmcp.googleapis.com) is in Developer
 * Preview and only serves Google Workspace accounts enrolled in the preview
 * programme; on a consumer account every tools/call answers "The caller does
 * not have permission". This module runs the *same nine tools* against the
 * Calendar REST API instead.
 *
 * The contract is Google's, not ours: tool names, argument names and result
 * shapes below mirror the input/outputSchema that calendarmcp.googleapis.com
 * publishes, so callers cannot tell which path served them and the app
 * upgrades to real MCP execution the moment the account is eligible.
 */

const BASE = "https://www.googleapis.com/calendar/v3";

const MAX_PAGE_SIZE = 250;
const MAX_SUGGESTIONS = 10;
const DEFAULT_SLOT_MINUTES = 30;

/** MCP notificationLevel -> REST sendUpdates. */
const SEND_UPDATES: Record<string, string> = {
  NONE: "none",
  EXTERNAL_ONLY: "externalOnly",
  ALL: "all",
};

/** MCP eventType -> REST eventTypes value. */
const EVENT_TYPE_TO_REST: Record<string, string> = {
  DEFAULT: "default",
  OUT_OF_OFFICE: "outOfOffice",
  FOCUS_TIME: "focusTime",
  WORKING_LOCATION: "workingLocation",
  BIRTHDAY: "birthday",
  FROM_GMAIL: "fromGmail",
};

const EVENT_TYPE_TO_MCP: Record<string, string> = Object.fromEntries(
  Object.entries(EVENT_TYPE_TO_REST).map(([mcp, rest]) => [rest, mcp]),
);

export class CalendarRestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarRestError";
  }
}

type Json = Record<string, unknown>;

async function calendarFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    let message = `Google Calendar rejected the request (${res.status}).`;
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new CalendarRestError(message);
  }
  if (res.status === 204) return {} as T;
  const body = await res.text();
  return (body ? JSON.parse(body) : {}) as T;
}

// --- argument helpers -------------------------------------------------------

function str(args: Json, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(args: Json, key: string): boolean {
  return args[key] === true;
}

function strList(args: Json, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function pageSize(args: Json): number {
  const value = args.pageSize;
  const parsed = typeof value === "number" ? Math.trunc(value) : 100;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, parsed || 100));
}

function calendarId(args: Json): string {
  return encodeURIComponent(str(args, "calendarId") ?? "primary");
}

function sendUpdates(args: Json): string | undefined {
  const level = str(args, "notificationLevel");
  return level ? SEND_UPDATES[level] : undefined;
}

/** All-day events carry a bare date; timed events an ISO timestamp. */
function toDateOrDateTime(
  value: string | undefined,
  allDay: boolean,
  timeZone: string | undefined,
): Json | undefined {
  if (!value) return undefined;
  if (allDay) return { date: value.slice(0, 10) };
  return { dateTime: value, ...(timeZone ? { timeZone } : {}) };
}

// --- response normalization -------------------------------------------------

type RestEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: Json;
  end?: Json;
  originalStartTime?: Json;
  attendees?: Json[];
  attachments?: Json[];
  creator?: Json;
  organizer?: Json;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  recurrence?: string[];
  recurringEventId?: string;
  eventType?: string;
  status?: string;
  transparency?: string;
  visibility?: string;
  colorId?: string;
  created?: string;
  updated?: string;
  reminders?: { overrides?: Json[] };
};

function conferenceUrl(event: RestEvent): string | undefined {
  if (event.hangoutLink) return event.hangoutLink;
  const video = event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video",
  );
  return video?.uri;
}

function normalizeAttendee(attendee: Json): Json {
  return {
    email: attendee.email,
    displayName: attendee.displayName,
    responseStatus: attendee.responseStatus,
    comment: attendee.comment,
    organizer: attendee.organizer,
    self: attendee.self,
    resource: attendee.resource,
    optionalAttendee: attendee.optional,
    additionalGuests: attendee.additionalGuests,
  };
}

/** REST event -> the Event shape the MCP server publishes. */
function normalizeEvent(event: RestEvent): Json {
  const url = conferenceUrl(event);
  return {
    id: event.id,
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    originalStartTime: event.originalStartTime,
    attendees: event.attendees?.map(normalizeAttendee),
    attachments: event.attachments,
    creator: event.creator,
    organizer: event.organizer,
    htmlLink: event.htmlLink,
    ...(url ? { conferenceUrl: url } : {}),
    recurrence: event.recurrence,
    recurringEventId: event.recurringEventId,
    eventType: event.eventType
      ? (EVENT_TYPE_TO_MCP[event.eventType] ?? event.eventType)
      : undefined,
    status: event.status,
    transparency: event.transparency,
    availability:
      event.transparency === "transparent"
        ? "AVAILABILITY_FREE"
        : "AVAILABILITY_BUSY",
    visibility: event.visibility,
    colorId: event.colorId,
    created: event.created,
    updated: event.updated,
    overrideReminders: event.reminders?.overrides,
  };
}

function whenLabel(event: RestEvent): string {
  const start = (event.start?.dateTime ?? event.start?.date) as
    | string
    | undefined;
  return start ?? "(no start)";
}

function eventLine(event: RestEvent): string {
  return `${whenLabel(event)}  ${event.summary ?? "(no title)"}`;
}

function eventsResult(events: RestEvent[], extra: Json = {}) {
  return {
    text: events.length
      ? events.map(eventLine).join("\n")
      : "No events matched.",
    structured: { events: events.map(normalizeEvent), ...extra },
  };
}

function singleEventResult(event: RestEvent, action: string) {
  return {
    text: `${action}: ${event.summary ?? "(no title)"} — ${whenLabel(event)}`,
    structured: normalizeEvent(event),
  };
}

// --- tools ------------------------------------------------------------------

type EventList = {
  items?: RestEvent[];
  nextPageToken?: string;
  summary?: string;
  timeZone?: string;
  accessRole?: string;
  updated?: string;
};

async function listEvents(token: string, args: Json) {
  const params = new URLSearchParams({
    maxResults: String(pageSize(args)),
    // Expand recurring series into occurrences: matches what callers mean by
    // "what's on my calendar", and keeps recurringEventId on each instance.
    singleEvents: "true",
  });
  const start = str(args, "startTime");
  const end = str(args, "endTime");
  if (start) params.set("timeMin", start);
  if (end) params.set("timeMax", end);
  const fullText = str(args, "fullText");
  if (fullText) params.set("q", fullText);
  const token_ = str(args, "pageToken");
  if (token_) params.set("pageToken", token_);
  const timeZone = str(args, "timeZone");
  if (timeZone) params.set("timeZone", timeZone);

  const orderBy = str(args, "orderBy");
  const descending = orderBy === "startTimeDesc";
  if (orderBy === "lastModified") params.set("orderBy", "updated");
  else if (orderBy !== "default") params.set("orderBy", "startTime");

  for (const type of strList(args, "eventType")) {
    const mapped = EVENT_TYPE_TO_REST[type];
    if (mapped) params.append("eventTypes", mapped);
  }

  const list = await calendarFetch<EventList>(
    token,
    `/calendars/${calendarId(args)}/events?${params}`,
  );
  // The REST API has no descending order; reverse the ascending page.
  const events = descending ? [...(list.items ?? [])].reverse() : (list.items ?? []);
  return eventsResult(events, {
    nextPageToken: list.nextPageToken,
    summary: list.summary,
    timeZone: list.timeZone,
    accessRole: list.accessRole,
    updated: list.updated,
  });
}

async function searchEvents(token: string, args: Json) {
  const query = str(args, "query");
  if (!query) throw new CalendarRestError('"query" is required.');
  const params = new URLSearchParams({
    q: query,
    maxResults: String(pageSize(args)),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const pageToken = str(args, "pageToken");
  if (pageToken) params.set("pageToken", pageToken);

  // The MCP tool searches the primary calendar only.
  const list = await calendarFetch<EventList>(
    token,
    `/calendars/primary/events?${params}`,
  );
  return eventsResult(list.items ?? [], { nextPageToken: list.nextPageToken });
}

async function getEvent(token: string, args: Json) {
  const eventId = str(args, "eventId");
  if (!eventId) throw new CalendarRestError('"eventId" is required.');
  const event = await calendarFetch<RestEvent>(
    token,
    `/calendars/${calendarId(args)}/events/${encodeURIComponent(eventId)}`,
  );
  return singleEventResult(event, "Event");
}

type CalendarList = {
  items?: { id?: string; summary?: string; description?: string; timeZone?: string }[];
  nextPageToken?: string;
};

async function listCalendars(token: string, args: Json) {
  const params = new URLSearchParams({ maxResults: String(pageSize(args)) });
  const pageToken = str(args, "pageToken");
  if (pageToken) params.set("pageToken", pageToken);

  const list = await calendarFetch<CalendarList>(
    token,
    `/users/me/calendarList?${params}`,
  );
  const calendars = (list.items ?? []).map((entry) => ({
    id: entry.id,
    summary: entry.summary,
    description: entry.description,
    timeZone: entry.timeZone,
  }));
  return {
    text: calendars.length
      ? calendars.map((c) => `${c.summary ?? c.id} (${c.id})`).join("\n")
      : "No calendars found.",
    structured: { calendars, nextPageToken: list.nextPageToken },
  };
}

/** Shared body builder for create/update. */
function eventBody(args: Json, existing?: RestEvent): Json {
  const allDay = bool(args, "allDay");
  const timeZone = str(args, "timeZone");
  const body: Json = {};

  const summary = str(args, "summary");
  if (summary) body.summary = summary;
  const description = str(args, "description");
  if (description) body.description = description;
  const location = str(args, "location");
  if (location) body.location = location;
  const colorId = str(args, "colorId");
  if (colorId) body.colorId = colorId;
  const visibility = str(args, "visibility");
  if (visibility) body.visibility = visibility;

  const start = toDateOrDateTime(str(args, "startTime"), allDay, timeZone);
  if (start) body.start = start;
  const end = toDateOrDateTime(str(args, "endTime"), allDay, timeZone);
  if (end) body.end = end;

  const availability = str(args, "availability");
  if (availability === "AVAILABILITY_FREE") body.transparency = "transparent";
  else if (availability === "AVAILABILITY_BUSY") body.transparency = "opaque";

  const eventType = str(args, "eventType");
  if (eventType && EVENT_TYPE_TO_REST[eventType]) {
    body.eventType = EVENT_TYPE_TO_REST[eventType];
  }

  const recurrence = strList(args, "recurrenceData");
  if (recurrence.length) body.recurrence = recurrence;

  const overrides = args.overrideReminders;
  if (Array.isArray(overrides) && overrides.length) {
    body.reminders = { useDefault: false, overrides };
  }

  // create: attendeeEmails. update: added/removedAttendeeEmails merged onto
  // whatever the event already has.
  const explicit = args.attendees ?? args.addedAttendees;
  const added = [
    ...strList(args, "attendeeEmails"),
    ...strList(args, "addedAttendeeEmails"),
  ];
  const removed = new Set(strList(args, "removedAttendeeEmails"));
  if (added.length || removed.size || Array.isArray(explicit)) {
    const current = (existing?.attendees ?? []) as { email?: string }[];
    const merged = new Map<string, Json>();
    for (const attendee of current) {
      if (attendee.email && !removed.has(attendee.email)) {
        merged.set(attendee.email, attendee as Json);
      }
    }
    for (const email of added) {
      if (!removed.has(email) && !merged.has(email)) merged.set(email, { email });
    }
    if (Array.isArray(explicit)) {
      for (const attendee of explicit as Json[]) {
        const email = typeof attendee.email === "string" ? attendee.email : null;
        if (email && !removed.has(email)) merged.set(email, attendee);
      }
    }
    body.attendees = [...merged.values()];
  }

  return body;
}

async function createEvent(token: string, args: Json) {
  for (const key of ["summary", "startTime", "endTime"]) {
    if (!str(args, key)) throw new CalendarRestError(`"${key}" is required.`);
  }
  const body = eventBody(args);

  const params = new URLSearchParams();
  const updates = sendUpdates(args);
  if (updates) params.set("sendUpdates", updates);
  if (bool(args, "addGoogleMeetUrl")) {
    params.set("conferenceDataVersion", "1");
    body.conferenceData = {
      createRequest: {
        // Deterministic per event so a retry cannot mint a second conference.
        requestId: `aster-${str(args, "startTime")}-${str(args, "summary")}`.slice(0, 64),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const query = params.toString();
  const event = await calendarFetch<RestEvent>(
    token,
    `/calendars/${calendarId(args)}/events${query ? `?${query}` : ""}`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return singleEventResult(event, "Created");
}

async function updateEvent(token: string, args: Json) {
  const eventId = str(args, "eventId");
  if (!eventId) throw new CalendarRestError('"eventId" is required.');
  const path = `/calendars/${calendarId(args)}/events/${encodeURIComponent(eventId)}`;

  // Attendee edits are relative, so the current list has to be read first.
  const touchesAttendees =
    strList(args, "addedAttendeeEmails").length > 0 ||
    strList(args, "removedAttendeeEmails").length > 0 ||
    Array.isArray(args.addedAttendees);
  const existing = touchesAttendees
    ? await calendarFetch<RestEvent>(token, path)
    : undefined;

  const body = eventBody(args, existing);
  const params = new URLSearchParams();
  const updates = sendUpdates(args);
  if (updates) params.set("sendUpdates", updates);
  if (bool(args, "addGoogleMeetUrl")) {
    params.set("conferenceDataVersion", "1");
    body.conferenceData = {
      createRequest: {
        requestId: `aster-${eventId}`.slice(0, 64),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const query = params.toString();
  const event = await calendarFetch<RestEvent>(
    token,
    `${path}${query ? `?${query}` : ""}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return singleEventResult(event, "Updated");
}

async function deleteEvent(token: string, args: Json) {
  const eventId = str(args, "eventId");
  if (!eventId) throw new CalendarRestError('"eventId" is required.');
  const path = `/calendars/${calendarId(args)}/events/${encodeURIComponent(eventId)}`;

  // Read first so the result can echo the deleted event, as the MCP tool does.
  let event: RestEvent = { id: eventId };
  try {
    event = await calendarFetch<RestEvent>(token, path);
  } catch {
    // Already gone or unreadable; the delete below reports the real outcome.
  }

  const params = new URLSearchParams();
  const updates = sendUpdates(args);
  if (updates) params.set("sendUpdates", updates);
  const query = params.toString();
  await calendarFetch(token, `${path}${query ? `?${query}` : ""}`, {
    method: "DELETE",
  });

  return {
    text: `Deleted: ${event.summary ?? eventId}`,
    structured: { ...normalizeEvent(event), status: "cancelled" },
  };
}

async function respondToEvent(token: string, args: Json) {
  const eventId = str(args, "eventId");
  const responseStatus = str(args, "responseStatus");
  if (!eventId) throw new CalendarRestError('"eventId" is required.');
  if (!responseStatus) {
    throw new CalendarRestError('"responseStatus" is required.');
  }
  const path = `/calendars/${calendarId(args)}/events/${encodeURIComponent(eventId)}`;
  const existing = await calendarFetch<RestEvent>(token, path);

  const comment = str(args, "responseComment");
  const attendees = (existing.attendees ?? []) as Json[];
  const self = attendees.find((attendee) => attendee.self === true);
  if (!self) {
    throw new CalendarRestError(
      "You are not an attendee of that event, so there is nothing to respond to.",
    );
  }
  self.responseStatus = responseStatus;
  if (comment) self.comment = comment;

  const params = new URLSearchParams();
  const updates = sendUpdates(args);
  if (updates) params.set("sendUpdates", updates);
  const query = params.toString();

  const event = await calendarFetch<RestEvent>(
    token,
    `${path}${query ? `?${query}` : ""}`,
    { method: "PATCH", body: JSON.stringify({ attendees }) },
  );
  return {
    text: `Responded "${responseStatus}" to ${event.summary ?? eventId}.`,
    structured: normalizeEvent(event),
  };
}

type FreeBusy = {
  calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
};

async function suggestTime(token: string, args: Json) {
  const start = str(args, "startTime");
  const end = str(args, "endTime");
  const attendees = strList(args, "attendeeEmails");
  if (!start || !end) {
    throw new CalendarRestError('"startTime" and "endTime" are required.');
  }
  const durationRaw = args.durationMinutes;
  const duration =
    typeof durationRaw === "number" && durationRaw > 0
      ? Math.trunc(durationRaw)
      : DEFAULT_SLOT_MINUTES;

  const items = [{ id: "primary" }, ...attendees.map((email) => ({ id: email }))];
  const freeBusy = await calendarFetch<FreeBusy>(token, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: start,
      timeMax: end,
      ...(str(args, "timeZone") ? { timeZone: str(args, "timeZone") } : {}),
      items,
    }),
  });

  // Merge every calendar's busy blocks, then invert them across the window.
  const busy: { start: number; end: number }[] = [];
  for (const entry of Object.values(freeBusy.calendars ?? {})) {
    for (const block of entry.busy ?? []) {
      const from = Date.parse(block.start);
      const to = Date.parse(block.end);
      if (!Number.isNaN(from) && !Number.isNaN(to)) busy.push({ start: from, end: to });
    }
  }
  busy.sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const block of busy) {
    const last = merged[merged.length - 1];
    if (last && block.start <= last.end) last.end = Math.max(last.end, block.end);
    else merged.push({ ...block });
  }

  const windowStart = Date.parse(start);
  const windowEnd = Date.parse(end);
  const slotMs = duration * 60_000;
  const slots: Json[] = [];
  let cursor = windowStart;
  for (const block of [...merged, { start: windowEnd, end: windowEnd }]) {
    if (block.start - cursor >= slotMs) {
      const slotEnd = new Date(cursor + slotMs).toISOString();
      const slotStart = new Date(cursor).toISOString();
      slots.push({
        start: { dateTime: slotStart },
        end: { dateTime: slotEnd },
        startTime: slotStart,
        endTime: slotEnd,
        durationMinutes: duration,
      });
      if (slots.length >= MAX_SUGGESTIONS) break;
    }
    cursor = Math.max(cursor, block.end);
  }

  return {
    text: slots.length
      ? slots.map((slot) => `${slot.startTime} → ${slot.endTime}`).join("\n")
      : `No ${duration}-minute slot is free in that window.`,
    structured: { timeSlots: slots },
  };
}

type ToolResult = { text: string; structured?: Record<string, unknown> };

const TOOLS: Record<string, (token: string, args: Json) => Promise<ToolResult>> = {
  list_events: listEvents,
  search_events: searchEvents,
  get_event: getEvent,
  list_calendars: listCalendars,
  create_event: createEvent,
  update_event: updateEvent,
  delete_event: deleteEvent,
  respond_to_event: respondToEvent,
  suggest_time: suggestTime,
};

export function restToolSupported(name: string): boolean {
  return name in TOOLS;
}

/** Runs one official Calendar MCP tool against the REST API. */
export async function callCalendarToolViaRest(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) throw new CalendarRestError(`Unknown tool: ${name}`);
  const token = await getValidAccessToken(userId);
  return tool(token, args);
}
