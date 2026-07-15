import { getSessionUser, unauthorized } from "@/lib/server/session";
import {
  WhatsAppNotConnectedError,
  ensureConnected,
} from "@/lib/server/whatsapp-manager";

/** Reopens the socket from stored creds (e.g. after a server restart). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    await ensureConnected(user.id);
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
