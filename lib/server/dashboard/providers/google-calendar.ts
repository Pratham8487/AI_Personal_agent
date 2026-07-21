import { callCalendarTool } from "@/lib/server/google-calendar-mcp";
import {
  cut,
  timeKey,
  titleKey,
  toIso,
  type DashboardProvider,
} from "../provider";
import type { BriefEntry, PriorityItem } from "@/lib/dashboard-brief-types";

const ID = "google-calendar";

const MAX_EVENTS = 8;
const UPCOMING_DAYS = 7;

/** Subset of the MCP server's Event shape that the brief actually reads. */
type CalendarDate = { date?: string; dateTime?: string };

type CalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: CalendarDate;
  end?: CalendarDate;
  htmlLink?: string;
  conferenceUrl?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
};

function parseEvents(structured: Record<string, unknown> | undefined) {
  const events = structured?.events;
  return Array.isArray(events) ? (events as CalendarEvent[]) : [];
}

function startOf(event: CalendarEvent): string {
  return event.start?.dateTime ?? event.start?.date ?? "";
}

/** True when the user themselves has not yet responded to the invitation. */
function needsResponse(event: CalendarEvent): boolean {
  return (event.attendees ?? []).some(
    (attendee) => attendee.self && attendee.responseStatus === "needsAction",
  );
}

/** Deep link to the event, falling back to the Calendar web client. */
function eventLink(event: CalendarEvent): string {
  return event.htmlLink ?? "https://calendar.google.com/calendar/r";
}

function listEvents(userId: string, startTime: string, endTime: string) {
  return callCalendarTool(userId, "list_events", {
    startTime,
    endTime,
    orderBy: "startTime",
    pageSize: MAX_EVENTS,
  });
}

function endOfToday(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);
  return date;
}

/** Bounded event fields for the AI payload; ref lets the AI cite the event. */
function toAiEvents(events: CalendarEvent[]) {
  return events.slice(0, MAX_EVENTS).map((event) => ({
    ref: event.id,
    title: cut(event.summary ?? "(no title)", 120),
    start: toIso(startOf(event)) || startOf(event),
    location: event.location ? cut(event.location, 80) : undefined,
    isOnline: Boolean(event.conferenceUrl),
    needsResponse: needsResponse(event),
  }));
}

export const googleCalendarProvider: DashboardProvider = {
  id: ID,
  name: "Google Calendar",
  icon: ID,
  promptHint:
    "google-calendar.todayEvents are meetings left today; google-calendar.upcomingEvents cover the next week; needsResponse marks invitations still awaiting the user's RSVP.",

  async fetchSnapshot(userId: string) {
    const now = new Date().toISOString();
    const [todayResult, upcomingResult] = await Promise.all([
      listEvents(userId, now, endOfToday().toISOString()),
      listEvents(userId, now, daysFromNow(UPCOMING_DAYS).toISOString()),
    ]);
    const today = parseEvents(todayResult.structured);
    const upcoming = parseEvents(upcomingResult.structured);
    const awaiting = upcoming.filter(needsResponse);

    const fallbackBrief: BriefEntry[] = [
      {
        text: today.length
          ? `You have ${today.length} meeting${today.length === 1 ? "" : "s"} left today.`
          : "No meetings left on your calendar today.",
        apps: [ID],
      },
    ];
    if (awaiting.length > 0) {
      fallbackBrief.push({
        text: `${awaiting.length} invitation${awaiting.length === 1 ? "" : "s"} still need${awaiting.length === 1 ? "s" : ""} your response.`,
        apps: [ID],
      });
    }

    const fallbackItems: PriorityItem[] = today.slice(0, 4).map((event) => ({
      source: ID,
      title: cut(event.summary ?? "(no title)", 120),
      description: cut(
        event.location || event.description || "Calendar event",
        240,
      ),
      priority: "medium" as const,
      timestamp: toIso(startOf(event)),
      link: eventLink(event),
    }));

    // Keyed by ref, start time, and normalized title so links resolve even
    // when the AI omits or rewrites the ref.
    const links: Record<string, string> = {};
    for (const event of [...today, ...upcoming]) {
      const url = eventLink(event);
      if (event.id) links[event.id] = url;
      const byTime = timeKey(startOf(event));
      if (byTime) links[byTime] = url;
      const byTitle = titleKey(event.summary ?? "");
      if (byTitle) links[byTitle] = url;
    }

    return {
      importantCount: today.length,
      followUpCount: awaiting.length,
      isEmpty: today.length === 0 && upcoming.length === 0,
      aiPayload: {
        todayEvents: toAiEvents(today),
        upcomingEvents: toAiEvents(upcoming),
      },
      fallbackBrief,
      fallbackItems,
      links,
    };
  },
};
