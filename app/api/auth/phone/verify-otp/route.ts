import { adminSql } from "@/lib/server/db";
import { verifyOtp } from "@/lib/server/otp";
import { normalizePhone, upsertPhoneUser } from "@/lib/server/phone-auth";
import { assertSameOrigin } from "@/lib/server/request-origin";
import {
  createSessionTokens,
  getRequestMeta,
  setAuthCookies,
  type SessionUser,
} from "@/lib/server/session";

export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: { phone?: string; otp?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  const otp = (body.otp ?? "").trim();
  if (!phone || !/^\d{6}$/.test(otp)) {
    return Response.json({ error: "Enter the 6-digit code we sent you." }, { status: 400 });
  }

  try {
    const result = await verifyOtp("PHONE_VERIFICATION", phone, otp);
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

    const name = typeof body.name === "string" ? body.name.trim() || undefined : undefined;
    const userId = await upsertPhoneUser(phone, name);

    const rows = await adminSql<{
      name: string | null;
      preferred_language: string;
      tour_completed: boolean;
      active: boolean;
    }>(
      `SELECT name, preferred_language, tour_completed, active
       FROM public.users WHERE id = $1`,
      [userId]
    );
    if (!rows[0]?.active) {
      return Response.json({ error: "This account is disabled." }, { status: 403 });
    }

    // The verified OTP is the credential: open the session directly.
    const pair = await createSessionTokens(userId, await getRequestMeta());
    await setAuthCookies(pair);

    const user: SessionUser = {
      id: userId,
      email: null,
      name: rows[0].name,
      avatarUrl: null,
      phone,
      providers: ["phone"],
      emailVerified: false,
      contactVerified: true,
      preferredLanguage: rows[0].preferred_language,
      tourCompleted: rows[0].tour_completed,
      active: true,
    };
    return Response.json({ user });
  } catch (error) {
    console.error("verify-otp failed:", error);
    return Response.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}
