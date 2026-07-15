import { adminSql } from "@/lib/server/db";
import { sendOtpEmail } from "@/lib/server/mailer";
import { generateOtp, invalidateOtps, isRateLimited, storeOtp } from "@/lib/server/otp";
import { assertSameOrigin } from "@/lib/server/request-origin";

/**
 * Always answers 200 {success:true} so responses never reveal whether an
 * account exists (anti-enumeration). Real failures are logged server-side.
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
    const rows = await adminSql<{ id: string; email_verified: boolean }>(
      `SELECT id, email_verified FROM public.users WHERE lower(email) = $1 AND active`,
      [email]
    );
    const user = rows[0];
    if (user && !user.email_verified && !(await isRateLimited("EMAIL_VERIFICATION", email))) {
      const otp = generateOtp();
      await storeOtp("EMAIL_VERIFICATION", email, otp, user.id);
      try {
        await sendOtpEmail(email, otp, "EMAIL_VERIFICATION");
      } catch (mailError) {
        await invalidateOtps("EMAIL_VERIFICATION", email);
        console.error("resend-verification send failed:", mailError);
      }
    }
  } catch (error) {
    console.error("resend-verification failed:", error);
  }
  return Response.json({ success: true });
}
