import { createMcpProxy } from "@/lib/server/mcp-proxy";
import {
  MicrosoftNotConfiguredError,
  MicrosoftNotConnectedError,
  MicrosoftNotEligibleError,
} from "@/lib/server/microsoft-oauth";
import {
  OutlookMcpError,
  callOutlookTool,
  listOutlookTools,
} from "@/lib/server/outlook-mcp";

/**
 * MCP server (Streamable HTTP, stateless) fronting Microsoft's official Work
 * IQ MCP servers for the signed-in user, authenticated by the session cookie:
 *
 *   POST /api/integrations/outlook/mcp
 *
 * tools/list returns the union of the Mail, Calendar and universal catalogs,
 * exactly as Microsoft serves them.
 */
export const { POST, GET } = createMcpProxy({
  serverName: "outlook-mcp-proxy",
  listTools: listOutlookTools,
  callTool: callOutlookTool,
  userFacingErrors: [
    MicrosoftNotConfiguredError,
    MicrosoftNotConnectedError,
    // Explains a requirement the user has to satisfy outside the app.
    MicrosoftNotEligibleError,
    // Upstream messages are user-facing (bad arguments, unknown tool, …).
    OutlookMcpError,
  ],
  genericError: "Could not reach Outlook. Please retry.",
  catalogError: "Could not load Outlook tools.",
});
