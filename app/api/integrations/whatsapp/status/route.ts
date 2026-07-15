import { getSessionUser, unauthorized } from "@/lib/server/session";
import { getStatus } from "@/lib/server/whatsapp-manager";

/** Connection status; the pairing dialog polls this until linked. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    return Response.json(await getStatus(user.id));
  } catch (error) {
    console.error("WhatsApp status failed:", error);
    return Response.json(
      { error: "Could not load the WhatsApp status. Please retry." },
      { status: 500 },
    );
  }
}
