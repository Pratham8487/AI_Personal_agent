import { sendEmail } from "@/lib/server/gmail-api";
import {
  GmailNotConfiguredError,
  GmailNotConnectedError,
} from "@/lib/server/gmail-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: {
    to?: string;
    subject?: string;
    body?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const to = (body.to ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const text = (body.body ?? "").trim();

  if (!EMAIL_PATTERN.test(to)) {
    return Response.json(
      { error: "Enter a valid recipient email address." },
      { status: 400 },
    );
  }
  if (!subject || !text) {
    return Response.json(
      { error: "Subject and message are required." },
      { status: 400 },
    );
  }
  if (subject.length > 300 || text.length > 10_000) {
    return Response.json({ error: "Message is too long." }, { status: 400 });
  }

  try {
    await sendEmail(user.id, to, subject, text);
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof GmailNotConfiguredError) {
      return Response.json(
        { error: error.message, code: "not_configured" },
        { status: 503 },
      );
    }
    if (error instanceof GmailNotConnectedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    console.error("Gmail send failed:", error);
    return Response.json(
      { error: "Could not send the email. Please retry." },
      { status: 502 },
    );
  }
}
