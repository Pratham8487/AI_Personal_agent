import { createConversation, pruneExpired } from "@/lib/server/agent/store";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/** POST → starts a fresh conversation, returns its id. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    await pruneExpired(user.id);
    const conversationId = await createConversation(user.id);
    return Response.json({ conversationId });
  } catch (error) {
    console.error("Agent new conversation failed:", error);
    return Response.json(
      { error: "Could not start a new conversation." },
      { status: 500 },
    );
  }
}
