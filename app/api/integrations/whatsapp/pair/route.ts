import { isUuid } from "@/lib/server/gmail-oauth";
import { normalizePhone } from "@/lib/server/phone-auth";
import {
  WhatsAppAlreadyLinkedError,
  beginPairing,
} from "@/lib/server/whatsapp-manager";

/** Starts a pairing attempt and returns the numeric linking code. */
export async function POST(request: Request) {
  let body: { userId?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const userId = body.userId ?? "";
  if (!isUuid(userId)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }
  const phone = normalizePhone(body.phone ?? "");
  if (!phone) {
    return Response.json(
      { error: "Enter a valid phone number with country code (e.g. +15551234567)." },
      { status: 400 },
    );
  }

  try {
    const { pairingCode, expiresAt } = await beginPairing(userId, phone);
    return Response.json({ pairingCode, expiresAt });
  } catch (error) {
    if (error instanceof WhatsAppAlreadyLinkedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("WhatsApp pairing failed:", error);
    return Response.json(
      { error: "Could not reach WhatsApp. Please retry." },
      { status: 504 },
    );
  }
}
