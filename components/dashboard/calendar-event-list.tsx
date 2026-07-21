"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatEventTime,
  parseEvents,
  type CalendarEvent,
  type McpResult,
} from "@/lib/calendar-mcp-client";

/**
 * Scrolling event list that pages through the calendar.
 *
 * Only about five events are visible; the rest arrive a page at a time as the
 * user scrolls, triggered by an invisible sentinel at the end of the list
 * rather than a "load more" button. Paging uses the MCP tool's own
 * `pageToken`/`nextPageToken` contract, so it works for list_events and
 * search_events alike.
 */

/** Roughly five cards; the list scrolls internally beyond that. */
const VIEWPORT_CLASS = "max-h-[26rem] overflow-y-auto";

/** Load the next page slightly before the sentinel is actually on screen. */
const PREFETCH_MARGIN = "120px";

export function isRecurring(event: CalendarEvent): boolean {
  return Boolean(event.recurringEventId || event.recurrence?.length);
}

function EventCard({ event }: { event: CalendarEvent }) {
  const attendees = event.attendees ?? [];
  const needsResponse = attendees.some(
    (attendee) => attendee.self && attendee.responseStatus === "needsAction",
  );
  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold text-zinc-900 dark:text-white">
          {event.summary || "(no title)"}
        </p>
        {isRecurring(event) && (
          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            Recurring
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {formatEventTime(event.start)}
        {event.end && ` — ${formatEventTime(event.end)}`}
      </p>
      {event.location && (
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {event.location}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {attendees.length > 0 && (
          <span className="text-zinc-500 dark:text-zinc-400">
            {attendees.length} guest{attendees.length === 1 ? "" : "s"}
          </span>
        )}
        {needsResponse && (
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            Needs your response
          </span>
        )}
        {event.conferenceUrl && (
          <a
            href={event.conferenceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-violet-500 dark:text-violet-400"
          >
            Join
          </a>
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
    </li>
  );
}

export default function CalendarEventList({
  initialEvents,
  initialPageToken,
  onlyRecurring = false,
  loadMore,
}: {
  initialEvents: CalendarEvent[];
  initialPageToken?: string;
  /** Client-side filter: the API has no "recurring only" query. */
  onlyRecurring?: boolean;
  /** Fetches one more page; resolves to the raw tool result. */
  loadMore: (pageToken: string) => Promise<McpResult>;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [pageToken, setPageToken] = useState(initialPageToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // The caller passes a fresh closure every render; hold it in a ref so
  // fetchNext keeps a stable identity and the observer isn't torn down
  // and rebuilt on each render.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  const fetchNext = useCallback(async () => {
    if (!pageToken || loading || error) return;
    setLoading(true);
    try {
      const result = await loadMoreRef.current(pageToken);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const page = parseEvents(result.structured) ?? [];
      const next = result.structured?.nextPageToken;
      setEvents((current) => {
        // Google can repeat an event across pages; keep the list a set.
        const seen = new Set(current.map((event) => event.id).filter(Boolean));
        return [
          ...current,
          ...page.filter((event) => !event.id || !seen.has(event.id)),
        ];
      });
      setPageToken(typeof next === "string" && next ? next : undefined);
    } catch {
      setError("Could not load more events.");
    } finally {
      setLoading(false);
    }
  }, [pageToken, loading, error]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    // No observer while a page is in flight; re-attaching once it lands makes
    // the next page fire automatically if the sentinel is still on screen,
    // which is what keeps a short list filling itself.
    if (!sentinel || !pageToken || loading || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNext();
      },
      { root: viewportRef.current, rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNext, pageToken, loading, error]);

  const shown = onlyRecurring ? events.filter(isRecurring) : events;

  if (shown.length === 0 && !pageToken) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {onlyRecurring ? "No recurring events in this window." : "No events found."}
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        {onlyRecurring
          ? `${shown.length} recurring of ${events.length} loaded`
          : `${shown.length} event${shown.length === 1 ? "" : "s"} loaded`}
        {pageToken ? " · scroll for more" : ""}
      </p>

      <div ref={viewportRef} className={VIEWPORT_CLASS}>
        <ul className="space-y-2 pr-1">
          {shown.map((event, index) => (
            <EventCard key={event.id ?? index} event={event} />
          ))}
        </ul>

        {/* Invisible trigger: entering the viewport fetches the next page. */}
        {pageToken && !error && (
          <div ref={sentinelRef} aria-hidden className="h-8">
            {loading && (
              <div className="skeleton mt-2 h-6 rounded-lg" />
            )}
          </div>
        )}

        {error && (
          <div className="mt-2">
            <p className="text-xs text-rose-500">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                void fetchNext();
              }}
              className="mt-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
