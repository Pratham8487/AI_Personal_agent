import { normalizePhone } from "@/lib/server/phone";
import { getSessionUser, unauthorized } from "@/lib/server/session";
import {
  WhatsAppAlreadyLinkedError,
  beginPairing,
  beginQrPairing,
} from "@/lib/server/whatsapp-manager";

/** Starts a pairing attempt: numeric linking code, or QR when mode=qr. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: { phone?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const phone = body.mode === "qr" ? null : normalizePhone(body.phone ?? "");
  if (body.mode !== "qr" && !phone) {
    return Response.json(
      { error: "Enter a valid phone number with country code (e.g. +15551234567)." },
      { status: 400 },
    );
  }

  try {
    if (body.mode === "qr") {
      const { qr } = await beginQrPairing(user.id);
      return Response.json({ qr });
    }
    const { pairingCode, expiresAt } = await beginPairing(user.id, phone as string);
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
