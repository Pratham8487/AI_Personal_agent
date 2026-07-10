import { isUuid } from "@/lib/server/gmail-oauth";
import { disconnectUser } from "@/lib/server/whatsapp-manager";

/** Unlinks the device and clears the session, synced data, and status. */
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
    await disconnectUser(userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error("WhatsApp disconnect failed:", error);
    return Response.json(
      { error: "Could not disconnect WhatsApp. Please retry." },
      { status: 500 },
    );
  }
}
