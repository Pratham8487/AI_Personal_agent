import {
  getActiveConversationId,
  listMessages,
  pruneExpired,
} from "@/lib/server/agent/store";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/** POST → today's conversation (if any) with its messages. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    await pruneExpired(user.id);
    const conversationId = await getActiveConversationId(user.id);
    if (!conversationId) {
      return Response.json({ conversationId: null, messages: [] });
    }
    const messages = await listMessages(conversationId);
    return Response.json({
      conversationId,
      messages: messages.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        apps: row.apps,
        suggestions: row.suggestions,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("Agent history failed:", error);
    return Response.json(
      { error: "Could not load your chat history." },
      { status: 500 },
    );
  }
}
