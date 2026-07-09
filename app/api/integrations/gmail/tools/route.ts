import { GMAIL_TOOLS, getProfile } from "@/lib/server/gmail-api";
import {
  GmailNotConfiguredError,
  GmailNotConnectedError,
  isUuid,
} from "@/lib/server/gmail-oauth";

/** Lists the Gmail actions available, verifying the connection is live. */
export async function GET(request: Request) {
  const uid = new URL(request.url).searchParams.get("uid") ?? "";
  if (!isUuid(uid)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    const profile = await getProfile(uid);
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
