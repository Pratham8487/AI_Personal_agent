"use client";

import { useEffect, useState } from "react";
import CalendarEventList, { isRecurring } from "./calendar-event-list";
import McpToolRunner, { type Preset, type ResultContext } from "./mcp-tool-runner";
import {
  callCalendarTool,
  formatEventTime,
  getCalendarTransport,
  listCalendarTools,
  parseCalendars,
  parseEvent,
  parseEvents,
  type CalendarEvent,
  type CalendarTransport,
  type McpResult,
  type McpTool,
} from "@/lib/calendar-mcp-client";

/**
 * The Google Calendar tool catalog, fetched live from the official MCP server
 * (tools/list) through our proxy — never a hardcoded list, so whatever Google
 * serves is what the user sees.
 */

const RECURRING_FILTER = "recurring";

/** Events fetched per request; the list pages as the user scrolls. */
const PAGE_SIZE = 10;

function isoAt(daysFromToday: number, endOfDay = false): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

/**
 * One-click argument fills for the common asks (today's agenda, the week
 * ahead, recurring meetings). These parameterize the server's own tools — they
 * are not extra tools.
 */
const PRESETS: Record<string, Preset[]> = {
  list_events: [
    {
      label: "Today",
      args: () => ({
        startTime: isoAt(0),
        endTime: isoAt(0, true),
        orderBy: "startTime",
        pageSize: PAGE_SIZE,
      }),
    },
    {
      label: "Next 7 days",
      args: () => ({
        startTime: new Date().toISOString(),
        endTime: isoAt(7, true),
        orderBy: "startTime",
        pageSize: PAGE_SIZE,
      }),
    },
    {
      label: "Recurring only",
      args: () => ({
        startTime: new Date().toISOString(),
        endTime: isoAt(30, true),
        orderBy: "startTime",
        pageSize: PAGE_SIZE,
      }),
      filter: RECURRING_FILTER,
    },
  ],
};

/** Single-event views (get_event, create_event, …) reuse the list's card. */
function SingleEvent({ event }: { event: CalendarEvent }) {
  return (
    <dl className="space-y-1 text-sm">
      <p className="font-semibold text-zinc-900 dark:text-white">
        {event.summary || "(no title)"}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {formatEventTime(event.start)}
        {event.end && ` — ${formatEventTime(event.end)}`}
      </p>
      {event.location && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{event.location}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 pt-0.5 text-[11px]">
        {isRecurring(event) && (
          <span className="text-zinc-500 dark:text-zinc-400">Recurring</span>
        )}
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-violet-500 dark:text-violet-400"
          >
            Open in Calendar
          </a>
        )}
      </div>
    </dl>
  );
}

function RawPanel({ structured }: { structured: Record<string, unknown> }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
        Raw response
      </summary>
      <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg bg-zinc-100 p-2 text-[11px] text-zinc-700 dark:bg-black/30 dark:text-zinc-300">
        {JSON.stringify(structured, null, 2)}
      </pre>
    </details>
  );
}

/** Formats whatever the tool returned; falls back to text + raw JSON. */
function renderResult(result: McpResult, context: ResultContext) {
  const structured = result.structured;

  const events = parseEvents(structured);
  if (events) {
    const nextPageToken = structured?.nextPageToken;
    return (
      <div>
        <CalendarEventList
          // A fresh run must not append to the previous run's list.
          key={context.runId}
          initialEvents={events}
          initialPageToken={
            typeof nextPageToken === "string" && nextPageToken
              ? nextPageToken
              : undefined
          }
          onlyRecurring={context.filter === RECURRING_FILTER}
          loadMore={(pageToken) => context.loadMore({ pageToken })}
        />
        {structured && <RawPanel structured={structured} />}
      </div>
    );
  }

  const calendars = parseCalendars(structured);
  if (calendars) {
    return (
      <div>
        <ul className="space-y-2">
          {calendars.map((calendar, index) => (
            <li
              key={calendar.id ?? index}
              className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-white/10 dark:bg-white/5"
            >
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                {calendar.summary || calendar.id}
              </p>
              {calendar.description && (
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {calendar.description}
                </p>
              )}
              <dl className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                {calendar.id && (
                  <div className="flex gap-1">
                    <dt>ID:</dt>
                    <dd className="font-mono">{calendar.id}</dd>
                  </div>
                )}
                {calendar.timeZone && (
                  <div className="flex gap-1">
                    <dt>Time zone:</dt>
                    <dd>{calendar.timeZone}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
        {structured && <RawPanel structured={structured} />}
      </div>
    );
  }

  const event = parseEvent(structured);
  if (event) {
    return (
      <div>
        <SingleEvent event={event} />
        {structured && <RawPanel structured={structured} />}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-200">
        {result.message || "Done."}
      </p>
      {structured && <RawPanel structured={structured} />}
    </div>
  );
}

/** Says plainly which server actually executes the tools. */
function TransportNote({ transport }: { transport: CalendarTransport }) {
  if (transport !== "rest") return null;
  return (
    <p className="mb-3 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200">
      Tools are running against the Calendar REST API. Google&apos;s official MCP
      server supplies these definitions but only executes for Workspace accounts
      in its Developer Preview, so it declined this account. Behaviour is
      identical; execution switches over automatically once the account is
      eligible.
    </p>
  );
}

export default function CalendarMcpTools() {
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [transport, setTransport] = useState<CalendarTransport>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getCalendarTransport()
      .then((value) => {
        if (active) setTransport(value);
      })
      .catch(() => {
        // Advisory only — never block the tool list on it.
      });
    listCalendarTools()
      .then((loaded) => {
        if (active) setTools(loaded);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load MCP tools.",
        );
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <div>
        <p className="text-sm text-rose-500">{error}</p>
        <button
          type="button"
          onClick={() => {
            setTools(null);
            setError(null);
            setAttempt((n) => n + 1);
          }}
          className="mt-3 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!tools) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="skeleton h-14 rounded-xl" />
        <div className="skeleton h-14 rounded-xl" />
        <div className="skeleton h-14 rounded-xl" />
        <div className="skeleton h-14 rounded-xl" />
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No MCP tools available.
      </p>
    );
  }

  return (
    <>
      <TransportNote transport={transport} />
      <ul className="grid items-start gap-3 lg:grid-cols-2">
        {tools.map((tool) => (
          <McpToolRunner
            key={tool.name}
            tool={tool}
            presets={PRESETS[tool.name]}
            run={(name, args) =>
              callCalendarTool(name, args).then((result) => {
                // The first call settles which path serves this account.
                void getCalendarTransport().then(setTransport).catch(() => {});
                return result;
              })
            }
            renderResult={renderResult}
          />
        ))}
      </ul>
    </>
  );
}
