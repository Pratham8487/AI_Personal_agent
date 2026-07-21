"use client";

import { useEffect, useMemo, useState } from "react";
import McpToolRunner, { type Preset, type ResultContext } from "./mcp-tool-runner";
import {
  callOutlookTool,
  formatGraphTime,
  isRecurringEvent,
  listOutlookTools,
  parseEvent,
  parseEvents,
  parseMessage,
  parseMessages,
  parseNamedItems,
  recipientLabel,
  type GraphEvent,
  type GraphMessage,
  type McpResult,
  type OutlookResource,
  type OutlookTool,
} from "@/lib/outlook-mcp-client";

/**
 * The Outlook tool catalog, fetched live from Microsoft's official Work IQ MCP
 * servers (tools/list) through our proxy — never a hardcoded list, so whatever
 * Microsoft serves is what the user sees.
 */

const RECURRING_FILTER = "recurring";

/** Events/messages fetched per request. */
const PAGE_SIZE = 10;

const GROUPS: { resource: OutlookResource; title: string; hint: string }[] = [
  {
    resource: "mail",
    title: "Mail",
    hint: "Work IQ Mail — read, search, send, reply and manage drafts.",
  },
  {
    resource: "calendar",
    title: "Calendar",
    hint: "Work IQ Calendar — events, invitations, availability and scheduling.",
  },
  {
    resource: "workiq",
    title: "Work IQ",
    hint: "Path-based tools that reach anything the two servers above do not expose, such as mail folders, attachments and calendar lists.",
  },
];

function isoAt(daysFromToday: number, endOfDay = false): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

/**
 * One-click argument fills for the common asks. These parameterize Microsoft's
 * own tools — they are not extra tools, and each one is dropped unless the
 * tool's published inputSchema actually declares the properties it sets, so a
 * rename on Microsoft's side degrades to "no preset" rather than a button that
 * fails.
 */
type PresetSpec = {
  label: string;
  /** Lazy, so date windows are computed at click time, not at page load. */
  args: () => Record<string, unknown>;
  filter?: string;
};

const NAMED_PRESETS: Record<string, PresetSpec[]> = {
  mcp_CalendarTools_graph_listCalendarView: [
    {
      label: "Today",
      args: () => ({
        startDateTime: isoAt(0),
        endDateTime: isoAt(0, true),
        top: PAGE_SIZE,
      }),
    },
    {
      label: "Next 7 days",
      args: () => ({
        startDateTime: new Date().toISOString(),
        endDateTime: isoAt(7, true),
        top: PAGE_SIZE,
      }),
    },
    {
      label: "Recurring only",
      args: () => ({
        startDateTime: new Date().toISOString(),
        endDateTime: isoAt(30, true),
        top: 50,
      }),
      filter: RECURRING_FILTER,
    },
  ],
  mcp_CalendarTools_graph_listEvents: [
    { label: "Upcoming", args: () => ({ top: PAGE_SIZE, orderby: "start/dateTime" }) },
    {
      label: "Recurring only",
      args: () => ({ top: 50, orderby: "start/dateTime" }),
      filter: RECURRING_FILTER,
    },
  ],
  mcp_MailTools_graph_mail_listSent: [
    { label: "Recent", args: () => ({ top: PAGE_SIZE }) },
  ],
};

/** Graph paths the universal `fetch` tool can serve, once its arg name is known. */
const FETCH_PATHS: { label: string; path: string }[] = [
  { label: "Recent inbox", path: "/me/mailFolders/inbox/messages?$top=10&$orderby=receivedDateTime desc" },
  { label: "Mail folders", path: "/me/mailFolders" },
  { label: "Calendars", path: "/me/calendars" },
];

/**
 * The universal server's tools take a resource path. Its exact argument name is
 * Microsoft's to choose (and the docs flag preview renames), so it is read off
 * the published schema rather than assumed.
 */
function pathArgument(tool: OutlookTool): string | null {
  const properties = Object.keys(tool.inputSchema?.properties ?? {});
  return (
    properties.find((name) => /^(path|resourcePath|url|endpoint)$/i.test(name)) ??
    null
  );
}

function presetsFor(tool: OutlookTool): Preset[] {
  const properties = tool.inputSchema?.properties ?? {};

  const specs: PresetSpec[] = [...(NAMED_PRESETS[tool.name] ?? [])];
  if (tool.name === "fetch") {
    const key = pathArgument(tool);
    if (key) {
      specs.push(
        ...FETCH_PATHS.map((entry) => ({
          label: entry.label,
          args: () => ({ [key]: entry.path }),
        })),
      );
    }
  }

  return specs.filter((spec) =>
    Object.keys(spec.args()).every((key) => key in properties),
  );
}

// --- result views -----------------------------------------------------------

const cardClass =
  "rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-white/10 dark:bg-white/5";

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

function MessageCard({ message }: { message: GraphMessage }) {
  const from = recipientLabel(message.from ?? message.sender);
  return (
    <li className={cardClass}>
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
        {message.subject || "(no subject)"}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {[from, formatGraphTime(message.receivedDateTime ?? message.sentDateTime)]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {message.bodyPreview && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          {message.bodyPreview}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-zinc-500 dark:text-zinc-400">
        {message.isRead === false && (
          <span className="font-semibold text-violet-500 dark:text-violet-400">
            Unread
          </span>
        )}
        {message.hasAttachments && <span>Has attachments</span>}
        {message.webLink && (
          <a
            href={message.webLink}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-violet-500 dark:text-violet-400"
          >
            Open in Outlook
          </a>
        )}
      </div>
    </li>
  );
}

function EventCard({ event }: { event: GraphEvent }) {
  return (
    <li className={cardClass}>
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
        {event.subject || "(no title)"}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {formatGraphTime(event.start, event.isAllDay)}
        {event.end && ` — ${formatGraphTime(event.end, event.isAllDay)}`}
      </p>
      {event.location?.displayName && (
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {event.location.displayName}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-zinc-500 dark:text-zinc-400">
        {isRecurringEvent(event) && <span>Recurring</span>}
        {event.isCancelled && <span className="text-rose-500">Cancelled</span>}
        {event.onlineMeeting?.joinUrl && (
          <a
            href={event.onlineMeeting.joinUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-violet-500 dark:text-violet-400"
          >
            Join
          </a>
        )}
        {event.webLink && (
          <a
            href={event.webLink}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-violet-500 dark:text-violet-400"
          >
            Open in Outlook
          </a>
        )}
      </div>
    </li>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="text-sm text-zinc-500 dark:text-zinc-400">No {label} matched.</p>
  );
}

/** Formats whatever the tool returned; falls back to text + raw JSON. */
function renderResult(result: McpResult, context: ResultContext) {
  const structured = result.structured;

  const events = parseEvents(structured);
  if (events) {
    const shown =
      context.filter === RECURRING_FILTER
        ? events.filter(isRecurringEvent)
        : events;
    return (
      <div>
        {shown.length ? (
          <ul className="space-y-2">
            {shown.map((event, index) => (
              <EventCard key={event.id ?? index} event={event} />
            ))}
          </ul>
        ) : (
          <Empty label="events" />
        )}
        {structured && <RawPanel structured={structured} />}
      </div>
    );
  }

  const messages = parseMessages(structured);
  if (messages) {
    return (
      <div>
        <ul className="space-y-2">
          {messages.map((message, index) => (
            <MessageCard key={message.id ?? index} message={message} />
          ))}
        </ul>
        {structured && <RawPanel structured={structured} />}
      </div>
    );
  }

  const named = parseNamedItems(structured);
  if (named) {
    return (
      <div>
        <ul className="space-y-2">
          {named.map((item, index) => (
            <li key={item.id ?? index} className={cardClass}>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                {item.displayName || item.name}
              </p>
              <dl className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                {typeof item.unreadItemCount === "number" && (
                  <div className="flex gap-1">
                    <dt>Unread:</dt>
                    <dd>{item.unreadItemCount}</dd>
                  </div>
                )}
                {typeof item.totalItemCount === "number" && (
                  <div className="flex gap-1">
                    <dt>Total:</dt>
                    <dd>{item.totalItemCount}</dd>
                  </div>
                )}
                {item.contentType && (
                  <div className="flex gap-1">
                    <dt>Type:</dt>
                    <dd>{item.contentType}</dd>
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
        <ul>
          <EventCard event={event} />
        </ul>
        {structured && <RawPanel structured={structured} />}
      </div>
    );
  }

  const message = parseMessage(structured);
  if (message) {
    return (
      <div>
        <ul>
          <MessageCard message={message} />
        </ul>
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

// --- component --------------------------------------------------------------

export default function OutlookMcpTools() {
  const [tools, setTools] = useState<OutlookTool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    listOutlookTools()
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

  /** Grouped by originating server; anything unlabelled falls under Work IQ. */
  const grouped = useMemo(() => {
    if (!tools) return [];
    return GROUPS.map((group) => ({
      ...group,
      tools: tools.filter((tool) =>
        group.resource === "workiq"
          ? tool.resource !== "mail" && tool.resource !== "calendar"
          : tool.resource === group.resource,
      ),
    })).filter((group) => group.tools.length > 0);
  }, [tools]);

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
    <div className="space-y-6">
      {grouped.map((group) => (
        <section key={group.resource}>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
            {group.title}
            <span className="ml-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
              {group.tools.length} tool{group.tools.length === 1 ? "" : "s"}
            </span>
          </h3>
          <p className="mt-0.5 mb-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {group.hint}
          </p>
          <ul className="grid items-start gap-3 lg:grid-cols-2">
            {group.tools.map((tool) => (
              <McpToolRunner
                key={tool.name}
                tool={tool}
                presets={presetsFor(tool)}
                run={callOutlookTool}
                renderResult={renderResult}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
