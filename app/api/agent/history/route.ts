import type { AgentMessagePayload } from "@/lib/agent-protocol";
import {
  getActiveConversationId,
  listMessages,
  pruneExpired,
} from "@/lib/server/agent/store";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/**
 * POST → today's conversation (if any) with its messages.
 *
 * Pruning happens here rather than mid-chat: this is the first call the page
 * makes, so expired transcripts are gone before anything can read them.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    await pruneExpired(user.id);
    const conversationId = await getActiveConversationId(user.id);
    if (!conversationId) {
      return Response.json({ conversationId: null, messages: [] });
    }
    const rows = await listMessages(conversationId);
    const messages: AgentMessagePayload[] = rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      apps: row.apps,
      suggestions: row.suggestions,
      createdAt: row.created_at,
    }));
    return Response.json({ conversationId, messages });
  } catch (error) {
    console.error("Agent history failed:", error);
    return Response.json(
      { error: "Could not load your chat history." },
      { status: 500 },
    );
  }
}
