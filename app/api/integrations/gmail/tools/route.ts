import { GMAIL_TOOLS, getProfile } from "@/lib/server/gmail-api";
import {
  GmailNotConfiguredError,
  GmailNotConnectedError,
} from "@/lib/server/gmail-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/** Lists the Gmail actions available, verifying the connection is live. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const profile = await getProfile(user.id);
    return Response.json({ tools: GMAIL_TOOLS, email: profile.emailAddress });
  } catch (error) {
    if (error instanceof GmailNotConfiguredError) {
      return Response.json(
        { error: error.message, code: "not_configured" },
        { status: 503 },
      );
    }
    if (error instanceof GmailNotConnectedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    console.error("Gmail tools check failed:", error);
    return Response.json(
      { error: "Could not reach Gmail. Please retry." },
      { status: 502 },
    );
  }
}
