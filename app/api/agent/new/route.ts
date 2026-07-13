import { createConversation, pruneExpired } from "@/lib/server/agent/store";
import { isUuid } from "@/lib/server/gmail-oauth";

/** POST { userId } → starts a fresh conversation, returns its id. */
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
    const conversationId = await createConversation(userId);
    return Response.json({ conversationId });
  } catch (error) {
    console.error("Agent new conversation failed:", error);
    return Response.json(
      { error: "Could not start a new conversation." },
      { status: 500 },
    );
  }
}
