import { isUuid } from "@/lib/server/gmail-oauth";
import { getStatus } from "@/lib/server/whatsapp-manager";

/** Connection status; the pairing dialog polls this until linked. */
export async function GET(request: Request) {
  const uid = new URL(request.url).searchParams.get("uid") ?? "";
  if (!isUuid(uid)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }
  try {
    return Response.json(await getStatus(uid));
  } catch (error) {
    console.error("WhatsApp status failed:", error);
    return Response.json(
      { error: "Could not load the WhatsApp status. Please retry." },
      { status: 500 },
    );
  }
}
