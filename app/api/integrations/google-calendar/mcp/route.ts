import {
  CalendarMcpError,
  calendarTransport,
  callCalendarTool,
  listCalendarTools,
} from "@/lib/server/google-calendar-mcp";
import { CalendarRestError } from "@/lib/server/google-calendar-rest";
import {
  GoogleNotConfiguredError,
  GoogleNotConnectedError,
} from "@/lib/server/google-oauth";
import { createMcpProxy } from "@/lib/server/mcp-proxy";

/**
 * MCP server (Streamable HTTP, stateless) fronting Google's official Calendar
 * MCP server for the signed-in user, authenticated by the session cookie:
 *
 *   POST /api/integrations/google-calendar/mcp
 *
 * This is a proxy, not an implementation: tools/list and tools/call are
 * forwarded upstream with the user's OAuth token attached, so the catalog is
 * always whatever Google actually serves.
 */
export const { POST, GET } = createMcpProxy({
  serverName: "google-calendar-mcp-proxy",
  listTools: listCalendarTools,
  callTool: callCalendarTool,
  userFacingErrors: [
    GoogleNotConfiguredError,
    GoogleNotConnectedError,
    // Upstream messages are user-facing (bad arguments, unknown tool, …).
    CalendarMcpError,
    CalendarRestError,
  ],
  genericError: "Could not reach Google Calendar. Please retry.",
  catalogError: "Could not load Google Calendar tools.",
  // Which path last executed a tool for this user: the official remote server,
  // or the local REST executor it falls back to.
  serverInfo: (uid) => ({ transport: calendarTransport(uid) }),
});
