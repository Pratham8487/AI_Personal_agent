import { adminSql } from "@/lib/server/db";
import { GMAIL_MCP_TOOLS, callGmailTool } from "@/lib/server/gmail-mcp";
import {
  callCalendarTool,
  listCalendarTools,
} from "@/lib/server/google-calendar-mcp";
import { WHATSAPP_MCP_TOOLS, callWhatsappTool } from "@/lib/server/whatsapp-mcp";

/**
 * Bridges MCP tool catalogs into OpenAI function-calling definitions.
 *
 * Tool names are namespaced ("gmail_search_inbox") so two catalogs can never
 * collide and every call can be attributed back to an app in the UI.
 *
 * To add a provider's live tools, add one LIVE_PROVIDERS entry — the tool
 * builder, dispatcher, and UI attribution all read from that single source.
 * Catalogs are async because remote MCP servers (Google Calendar) are asked
 * for theirs at runtime rather than shipping a hardcoded copy.
 */

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type LiveProvider = {
  id: string;
  catalog: () => Promise<readonly McpToolDefinition[]>;
  call: (
    userId: string,
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<{ text: string }>;
};

const LIVE_PROVIDERS: readonly LiveProvider[] = [
  { id: "gmail", catalog: async () => GMAIL_MCP_TOOLS, call: callGmailTool },
  {
    id: "google-calendar",
    catalog: listCalendarTools,
    call: callCalendarTool,
  },
  {
    id: "whatsapp",
    catalog: async () => WHATSAPP_MCP_TOOLS,
    call: callWhatsappTool,
  },
];

export type AgentTool = {
  provider: string;
  /** Un-namespaced tool name passed to the MCP dispatcher. */
  toolName: string;
  call: LiveProvider["call"];
  definition: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
};

export async function connectedProviders(userId: string): Promise<string[]> {
  const rows = await adminSql<{ provider: string }>(
    "SELECT provider FROM user_integrations WHERE user_id = $1 AND status = 'connected'",
    [userId],
  );
  return rows.map((row) => row.provider);
}

/**
 * Tools for the user's connected live providers only. A provider whose catalog
 * cannot be reached is skipped rather than failing the turn — the rest of the
 * user's apps stay usable.
 */
export async function buildAgentTools(
  providers: string[],
): Promise<AgentTool[]> {
  const connected = LIVE_PROVIDERS.filter((provider) =>
    new Set(providers).has(provider.id),
  );
  const catalogs = await Promise.all(
    connected.map(async (provider) => {
      try {
        return await provider.catalog();
      } catch (error) {
        console.error(`Tool catalog unavailable (${provider.id}):`, error);
        return [];
      }
    }),
  );

  const tools: AgentTool[] = [];
  connected.forEach((provider, index) => {
    for (const tool of catalogs[index]) {
      tools.push({
        provider: provider.id,
        toolName: tool.name,
        call: provider.call,
        definition: {
          type: "function",
          function: {
            name: `${provider.id}_${tool.name}`,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        },
      });
    }
  });
  return tools;
}

export type ToolOutcome = { text: string; ok: boolean };

/**
 * Executes one tool call. Failures come back as text rather than throwing so
 * the model can explain the problem to the user instead of the whole turn
 * dying — `ok` lets the UI mark the step as failed either way.
 */
export async function executeAgentTool(
  userId: string,
  tool: AgentTool,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  try {
    const result = await tool.call(userId, tool.toolName, args);
    return { text: result.text || "Done.", ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { text: `Tool "${tool.toolName}" failed: ${message}`, ok: false };
  }
}
