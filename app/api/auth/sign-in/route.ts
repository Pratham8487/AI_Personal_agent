import { logAuthEvent } from "@/lib/server/auth-log";
import { adminSql } from "@/lib/server/db";
import { sendLoginOtpEmail } from "@/lib/server/mailer";
import { generateOtp, invalidateOtps, isRateLimited, storeOtp } from "@/lib/server/otp";
import { verifyPassword } from "@/lib/server/passwords";
import { assertSameOrigin } from "@/lib/server/request-origin";

type UserRow = {
  id: string;
  email: string | null;
  active: boolean;
  password_hash: string | null;
  providers: string[];
};

/**
 * First leg of two-factor sign-in. A correct password no longer produces a
 * session — it only earns a mailed one-time code. POST /api/auth/verify-otp
 * exchanges that code for the actual session cookies.
 */
export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  try {
    const rows = await adminSql<UserRow>(
      `SELECT id, email, active, password_hash, providers
       FROM public.users WHERE lower(email) = $1`,
      [email]
    );
    const row = rows[0] as UserRow | undefined;

    const valid = await verifyPassword(password, row?.password_hash ?? null);
    if (!valid) {
      logAuthEvent("sign_in.password_failed", { email });
      // Deliberate UX exception to the uniform error: Google-only accounts
      // have no password to type.
      if (row && !row.password_hash && (row.providers ?? []).includes("google")) {
        return Response.json(
          { error: "This account uses Google sign-in. Continue with Google instead." },
          { status: 401 }
        );
      }
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }
    // Checked only after the password verified, so it leaks nothing to guessers.
    if (!row!.active) {
      logAuthEvent("sign_in.account_disabled", { email, userId: row!.id });
      return Response.json({ error: "This account is disabled." }, { status: 403 });
    }
    logAuthEvent("sign_in.password_ok", { email, userId: row!.id });

    // A code sent in the last OTP_RESEND_SECONDS is still live, so re-sending
    // would only invalidate the one the user is probably already reading.
    if (await isRateLimited("LOGIN", email)) {
      logAuthEvent("sign_in.otp_throttled", { email, userId: row!.id });
      return Response.json({ otpRequired: true, email, resent: false });
    }

    const otp = generateOtp();
    await storeOtp("LOGIN", email, otp, row!.id);
    try {
      await sendLoginOtpEmail(email, otp);
    } catch (mailError) {
      // Don't strand a live code nobody can read.
      await invalidateOtps("LOGIN", email);
      logAuthEvent("sign_in.otp_send_failed", { email, userId: row!.id });
      console.error("sign-in otp send failed:", mailError);
      return Response.json(
        { error: "We couldn't send your sign-in code. Please try again." },
        { status: 502 }
      );
    }

    logAuthEvent("sign_in.otp_sent", { email, userId: row!.id });
    return Response.json({ otpRequired: true, email, resent: true });
  } catch (error) {
    console.error("sign-in failed:", error);
    return Response.json({ error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
