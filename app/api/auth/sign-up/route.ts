import { adminSql } from "@/lib/server/db";
import { sendOtpEmail } from "@/lib/server/mailer";
import { generateOtp, invalidateOtps, storeOtp } from "@/lib/server/otp";
import { hashPassword } from "@/lib/server/passwords";
import { assertSameOrigin } from "@/lib/server/request-origin";
import {
  createSessionTokens,
  getRequestMeta,
  setAuthCookies,
  type SessionUser,
} from "@/lib/server/session";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  providers: string[];
  email_verified: boolean;
  contact_verified: boolean;
  tour_completed: boolean;
  active: boolean;
};

function toUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    providers: row.providers ?? [],
    emailVerified: row.email_verified,
    contactVerified: row.contact_verified,
    tourCompleted: row.tour_completed,
    active: row.active,
  };
}

export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: { email?: string; password?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const name = typeof body.name === "string" ? body.name.trim() || null : null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 6) {
    return Response.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }

  try {
    const passwordHash = await hashPassword(password);
    const rows = await adminSql<UserRow>(
      `INSERT INTO public.users
         (email, name, password_hash, providers, email_verified, verification_method, last_login_at)
       VALUES ($1, $2, $3, ARRAY['email'], false, 'email', now())
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, name, avatar_url, phone, providers, email_verified,
                 contact_verified, tour_completed, active`,
      [email, name, passwordHash]
    );
    if (rows.length === 0) {
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const user = toUser(rows[0]);

    // Grace model: the session opens right away; verification is a follow-up
    // step the user can complete (or skip) without being locked out.
    const pair = await createSessionTokens(user.id, await getRequestMeta());
    await setAuthCookies(pair);

    let verificationEmailSent = false;
    try {
      const otp = generateOtp();
      await storeOtp("EMAIL_VERIFICATION", email, otp, user.id);
      await sendOtpEmail(email, otp, "EMAIL_VERIFICATION");
      verificationEmailSent = true;
    } catch (mailError) {
      // A failed send must never fail the signup, or rate-limit the retry.
      await invalidateOtps("EMAIL_VERIFICATION", email);
      console.error("verification email send failed:", mailError);
    }

    return Response.json({ user, requiresVerification: true, verificationEmailSent });
  } catch (error) {
    console.error("sign-up failed:", error);
    return Response.json({ error: "Sign-up failed. Please try again." }, { status: 500 });
  }
}
