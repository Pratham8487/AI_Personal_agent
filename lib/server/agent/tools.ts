import { GMAIL_MCP_TOOLS, callGmailTool } from "@/lib/server/gmail-mcp";
import { adminSql } from "@/lib/server/phone-auth";
import { WHATSAPP_MCP_TOOLS, callWhatsappTool } from "@/lib/server/whatsapp-mcp";

/**
 * Bridges the Gmail/WhatsApp MCP tool catalogs into OpenAI function-calling
 * definitions. Tool names are namespaced ("gmail_search_inbox") so the two
 * catalogs cannot collide and the UI can attribute each call to an app.
 */

export type AgentTool = {
  provider: "gmail" | "whatsapp";
  /** Un-namespaced tool name passed to the MCP dispatcher. */
  toolName: string;
  definition: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
};

function toAgentTool(
  provider: AgentTool["provider"],
  tool: { name: string; description: string; inputSchema: Record<string, unknown> },
): AgentTool {
  return {
    provider,
    toolName: tool.name,
    definition: {
      type: "function",
      function: {
        name: `${provider}_${tool.name}`,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    },
  };
}

export async function connectedProviders(userId: string): Promise<string[]> {
  const rows = await adminSql<{ provider: string }>(
    "SELECT provider FROM user_integrations WHERE user_id = $1 AND status = 'connected'",
    [userId],
  );
  return rows.map((row) => row.provider);
}

/** Tools for the user's connected live providers only. */
export function buildAgentTools(providers: string[]): AgentTool[] {
  const tools: AgentTool[] = [];
  if (providers.includes("gmail")) {
    for (const tool of GMAIL_MCP_TOOLS) tools.push(toAgentTool("gmail", tool));
  }
  if (providers.includes("whatsapp")) {
    for (const tool of WHATSAPP_MCP_TOOLS)
      tools.push(toAgentTool("whatsapp", tool));
  }
  return tools;
}

/**
 * Executes one tool call; failures come back as text so the model can
 * explain the problem instead of the whole turn dying.
 */
export async function executeAgentTool(
  userId: string,
  tool: AgentTool,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const result =
      tool.provider === "gmail"
        ? await callGmailTool(userId, tool.toolName, args)
        : await callWhatsappTool(userId, tool.toolName, args);
    return result.text || "Done.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return `Tool "${tool.toolName}" failed: ${message}`;
  }
}
