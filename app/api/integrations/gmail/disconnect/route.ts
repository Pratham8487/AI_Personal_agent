import {
  deleteTokens,
  markGmailStatus,
} from "@/lib/server/gmail-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/** Revokes the Google grant and clears the stored tokens + status. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    await deleteTokens(user.id);
    await markGmailStatus(user.id, "disconnected");
    return Response.json({ success: true });
  } catch (error) {
    console.error("Gmail disconnect failed:", error);
    return Response.json(
      { error: "Could not disconnect Gmail. Please retry." },
      { status: 500 },
    );
  }
}
