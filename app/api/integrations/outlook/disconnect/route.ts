import { disconnectMicrosoft } from "@/lib/server/microsoft-oauth";
import { forgetOutlookSessions } from "@/lib/server/outlook-mcp";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/**
 * Turns Outlook off. Entra exposes no revocation endpoint, and revoking would
 * mean calling Microsoft Graph — which this integration deliberately never
 * does — so dropping our copy of the tokens is the terminal action. Cached MCP
 * sessions go with them, since they are bound to the tokens.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    await disconnectMicrosoft(user.id);
    forgetOutlookSessions(user.id);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Outlook disconnect failed:", error);
    return Response.json(
      { error: "Could not disconnect Outlook. Please retry." },
      { status: 500 },
    );
  }
}
