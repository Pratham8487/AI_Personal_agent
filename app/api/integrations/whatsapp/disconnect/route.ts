import { getSessionUser, unauthorized } from "@/lib/server/session";
import { disconnectUser } from "@/lib/server/whatsapp-manager";

/** Unlinks the device and clears the session, synced data, and status. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    await disconnectUser(user.id);
    return Response.json({ success: true });
  } catch (error) {
    console.error("WhatsApp disconnect failed:", error);
    return Response.json(
      { error: "Could not disconnect WhatsApp. Please retry." },
      { status: 500 },
    );
  }
}
