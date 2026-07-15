import { adminSql } from "@/lib/server/db";
import { sendPasswordResetEmail } from "@/lib/server/mailer";
import {
  generateOtp,
  invalidateOtps,
  isRateLimited,
  OTP_TTL_MINUTES,
  storeOtp,
} from "@/lib/server/otp";
import { assertSameOrigin } from "@/lib/server/request-origin";

/**
 * Always answers 200 {success:true} so responses never reveal whether an
 * account exists (anti-enumeration). Works for Google-only accounts too —
 * a successful reset ADDS email+password sign-in for them.
 */
export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return Response.json({ success: true });

  try {
    const rows = await adminSql<{ id: string }>(
      `SELECT id FROM public.users WHERE lower(email) = $1 AND active`,
      [email]
    );
    const user = rows[0];
    if (user && !(await isRateLimited("PASSWORD_RESET", email))) {
      const otp = generateOtp();
      const { hash } = await storeOtp("PASSWORD_RESET", email, otp, user.id);
      await adminSql(
        `UPDATE public.password_reset_requests SET active = false
         WHERE user_id = $1 AND active AND used_at IS NULL`,
        [user.id]
      );
      await adminSql(
        `INSERT INTO public.password_reset_requests (user_id, reset_token_hash, expires_at)
         VALUES ($1, $2, now() + interval '${OTP_TTL_MINUTES} minutes')`,
        [user.id, hash]
      );
      try {
        await sendPasswordResetEmail(email, otp);
      } catch (mailError) {
        await invalidateOtps("PASSWORD_RESET", email);
        await adminSql(
          `UPDATE public.password_reset_requests SET active = false
           WHERE user_id = $1 AND active AND used_at IS NULL`,
          [user.id]
        );
        console.error("password reset email send failed:", mailError);
      }
    }
  } catch (error) {
    console.error("forgot-password failed:", error);
  }
  return Response.json({ success: true });
}
