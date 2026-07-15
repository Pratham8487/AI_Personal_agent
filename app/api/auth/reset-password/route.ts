import { adminSql } from "@/lib/server/db";
import { verifyOtp } from "@/lib/server/otp";
import { hashPassword } from "@/lib/server/passwords";
import { assertSameOrigin } from "@/lib/server/request-origin";
import { revokeAllUserSessions } from "@/lib/server/session";

export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: { email?: string; otp?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const otp = (body.otp ?? "").trim();
  const newPassword = body.newPassword ?? "";
  if (!email || !/^\d{6}$/.test(otp)) {
    return Response.json({ error: "Enter the 6-digit code we sent you." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return Response.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }

  try {
    const result = await verifyOtp("PASSWORD_RESET", email, otp);
    if (!result.ok) {
      if (result.reason === "expired") {
        return Response.json(
          { error: "This code has expired. Please request a new one." },
          { status: 400 }
        );
      }
      if (result.reason === "too_many_attempts") {
        return Response.json(
          { error: "Too many attempts. Please request a new code." },
          { status: 429 }
        );
      }
      return Response.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    // A successful reset proves inbox ownership, so it doubles as email
    // verification and adds the email provider for Google-only accounts.
    const rows = await adminSql<{ id: string }>(
      `UPDATE public.users SET
         password_hash = $2,
         email_verified = true,
         contact_verified = true,
         providers = CASE WHEN 'email' = ANY(providers) THEN providers
                          ELSE array_append(providers, 'email') END,
         updated_at = now()
       WHERE lower(email) = $1 AND active
       RETURNING id`,
      [email, passwordHash]
    );
    if (rows.length === 0) {
      return Response.json({ error: "Account not found." }, { status: 404 });
    }
    const userId = rows[0].id;

    await adminSql(
      `UPDATE public.password_reset_requests SET used_at = now(), active = false
       WHERE user_id = $1 AND active AND used_at IS NULL`,
      [userId]
    );
    // Every device signs in again with the new password.
    await revokeAllUserSessions(userId);

    return Response.json({ success: true });
  } catch (error) {
    console.error("reset-password failed:", error);
    return Response.json({ error: "Reset failed. Please try again." }, { status: 500 });
  }
}
