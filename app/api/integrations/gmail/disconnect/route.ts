import {
  deleteTokens,
  isUuid,
  markGmailStatus,
} from "@/lib/server/gmail-oauth";

/** Revokes the Google grant and clears the stored tokens + status. */
export async function POST(request: Request) {
  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const userId = body.userId ?? "";
  if (!isUuid(userId)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    await deleteTokens(userId);
    await markGmailStatus(userId, "disconnected");
    return Response.json({ success: true });
  } catch (error) {
    console.error("Gmail disconnect failed:", error);
    return Response.json(
      { error: "Could not disconnect Gmail. Please retry." },
      { status: 500 },
    );
  }
}
