import { adminSql } from "@/lib/server/db";
import { verifyOtp } from "@/lib/server/otp";
import { assertSameOrigin } from "@/lib/server/request-origin";
import type { SessionUser } from "@/lib/server/session";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  providers: string[];
  email_verified: boolean;
  contact_verified: boolean;
  preferred_language: string;
  tour_completed: boolean;
  active: boolean;
};

/** Sessionless by design: possession of the emailed code proves identity. */
export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: { email?: string; otp?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const otp = (body.otp ?? "").trim();
  if (!email || !/^\d{6}$/.test(otp)) {
    return Response.json({ error: "Enter the 6-digit code we sent you." }, { status: 400 });
  }

  try {
    const result = await verifyOtp("EMAIL_VERIFICATION", email, otp);
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

    const rows = await adminSql<UserRow>(
      `UPDATE public.users
       SET email_verified = true, contact_verified = true, updated_at = now()
       WHERE lower(email) = $1
       RETURNING id, email, name, avatar_url, phone, providers, email_verified,
                 contact_verified, preferred_language, tour_completed, active`,
      [email]
    );
    if (rows.length === 0) {
      return Response.json({ error: "Account not found." }, { status: 404 });
    }
    const row = rows[0];
    const user: SessionUser = {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      phone: row.phone,
      providers: row.providers ?? [],
      emailVerified: row.email_verified,
      contactVerified: row.contact_verified,
      preferredLanguage: row.preferred_language,
      tourCompleted: row.tour_completed,
      active: row.active,
    };
    return Response.json({ user });
  } catch (error) {
    console.error("verify-email failed:", error);
    return Response.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}
