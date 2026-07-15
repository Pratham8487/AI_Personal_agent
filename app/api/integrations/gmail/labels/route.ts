import { getLabels } from "@/lib/server/gmail-api";
import {
  GmailNotConfiguredError,
  GmailNotConnectedError,
} from "@/lib/server/gmail-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const labels = await getLabels(user.id);
    return Response.json({ labels });
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
    console.error("Gmail labels fetch failed:", error);
    return Response.json(
      { error: "Could not fetch labels from Gmail. Please retry." },
      { status: 502 },
    );
  }
}
