import { getLabels } from "@/lib/server/gmail-api";
import {
  GmailNotConfiguredError,
  GmailNotConnectedError,
  isUuid,
} from "@/lib/server/gmail-oauth";

export async function GET(request: Request) {
  const uid = new URL(request.url).searchParams.get("uid") ?? "";
  if (!isUuid(uid)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    const labels = await getLabels(uid);
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
