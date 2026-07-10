import { isUuid } from "@/lib/server/gmail-oauth";
import {
  WhatsAppNotConnectedError,
  ensureConnected,
} from "@/lib/server/whatsapp-manager";

/** Reopens the socket from stored creds (e.g. after a server restart). */
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
    await ensureConnected(userId);
    return Response.json({ connection: "open" });
  } catch (error) {
    if (error instanceof WhatsAppNotConnectedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("WhatsApp reconnect failed:", error);
    return Response.json(
      { error: "Could not reach WhatsApp. Please retry." },
      { status: 504 },
    );
  }
}
