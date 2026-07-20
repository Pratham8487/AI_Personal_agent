import { logAuthEvent } from "@/lib/server/auth-log";
import { adminSql } from "@/lib/server/db";
import { verifyOtp } from "@/lib/server/otp";
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

/**
 * Second leg of two-factor sign-in: exchanges a LOGIN code for session
 * cookies. Sessionless by design — the password leg already ran, and
 * verifyOtp() consumes the code so it cannot be replayed.
 */
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
    // Handles expiry, the attempt cap, timing-safe compare, and consumption.
    const result = await verifyOtp("LOGIN", email, otp);
    if (!result.ok) {
      if (result.reason === "expired") {
        logAuthEvent("verify_otp.expired", { email });
        return Response.json(
          { error: "This code has expired. Please sign in again to get a new one." },
          { status: 400 }
        );
      }
      if (result.reason === "too_many_attempts") {
        logAuthEvent("verify_otp.too_many_attempts", { email });
        return Response.json(
          { error: "Too many attempts. Please sign in again to get a new code." },
          { status: 429 }
        );
      }
      logAuthEvent("verify_otp.mismatch", { email });
      return Response.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }

    // Prefer the id captured when the code was issued; it survives an email
    // change made between the two legs.
    const rows = result.userId
      ? await adminSql<UserRow>(
          `SELECT id, email, name, avatar_url, phone, providers, email_verified,
                  contact_verified, tour_completed, active
           FROM public.users WHERE id = $1`,
          [result.userId]
        )
      : await adminSql<UserRow>(
          `SELECT id, email, name, avatar_url, phone, providers, email_verified,
                  contact_verified, tour_completed, active
           FROM public.users WHERE lower(email) = $1`,
          [email]
        );

    const row = rows[0] as UserRow | undefined;
    if (!row) {
      logAuthEvent("verify_otp.user_missing", { email });
      return Response.json({ error: "Account not found." }, { status: 404 });
    }
    // Re-checked here: the account may have been disabled since the password leg.
    if (!row.active) {
      logAuthEvent("verify_otp.account_disabled", { email, userId: row.id });
      return Response.json({ error: "This account is disabled." }, { status: 403 });
    }

    await adminSql(
      `UPDATE public.users SET last_login_at = now(), updated_at = now() WHERE id = $1`,
      [row.id]
    );

    const user: SessionUser = {
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
    const pair = await createSessionTokens(user.id, await getRequestMeta());
    await setAuthCookies(pair);
    logAuthEvent("verify_otp.success", { email, userId: row.id });
    return Response.json({ user });
  } catch (error) {
    console.error("verify-otp failed:", error);
    return Response.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}
