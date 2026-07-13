import {
  getActiveConversationId,
  listMessages,
  pruneExpired,
} from "@/lib/server/agent/store";
import { isUuid } from "@/lib/server/gmail-oauth";

/** POST { userId } → today's conversation (if any) with its messages. */
export async function POST(request: Request) {
  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const userId = body.userId ?? "";
  if (!isUuid(userId)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    await pruneExpired(userId);
    const conversationId = await getActiveConversationId(userId);
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
