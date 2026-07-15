import { callGmailTool, InvalidToolArgsError } from "@/lib/server/gmail-mcp";
import { GmailNotConnectedError } from "@/lib/server/gmail-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";
import { callWhatsappTool } from "@/lib/server/whatsapp-mcp";
import { WhatsAppNotConnectedError } from "@/lib/server/whatsapp-manager";

/**
 * Sends the composed message through the selected channel.
 * Body: { channel: "gmail" | "whatsapp", to, subject?, body }.
 * Delegates to the existing per-user tool dispatchers, which validate
 * recipients/lengths and hold the live WhatsApp socket in this process.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: {
    channel?: string;
    to?: string;
    subject?: string;
    body?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.channel !== "gmail" && body.channel !== "whatsapp") {
    return Response.json({ error: "Invalid channel." }, { status: 400 });
  }

  try {
    if (body.channel === "gmail") {
      await callGmailTool(user.id, "send_email", {
        to: body.to,
        subject: body.subject,
        body: body.body,
      });
    } else {
      await callWhatsappTool(user.id, "send_message", {
        to: body.to,
        text: body.body,
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof InvalidToolArgsError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof GmailNotConnectedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof WhatsAppNotConnectedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Briefings: send failed:", error);
    return Response.json(
      { error: "Could not send the message. Please retry." },
      { status: 502 },
    );
  }
}
