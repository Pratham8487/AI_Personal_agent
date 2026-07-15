import { fetchEmails } from "@/lib/server/gmail-api";
import {
  GmailNotConfiguredError,
  GmailNotConnectedError,
} from "@/lib/server/gmail-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const params = new URL(request.url).searchParams;
  const parsed = Number.parseInt(params.get("count") ?? "5", 10);
  const count = Math.min(10, Math.max(1, Number.isNaN(parsed) ? 5 : parsed));
  const query = params.get("q")?.trim().slice(0, 200) || undefined;

  try {
    const result = await fetchEmails(user.id, count, query);
    return Response.json(result);
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
    console.error("Gmail email fetch failed:", error);
    return Response.json(
      { error: "Could not fetch emails from Gmail. Please retry." },
      { status: 502 },
    );
  }
}
