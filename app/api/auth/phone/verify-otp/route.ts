import {
  adminSql,
  derivePassword,
  ensurePhoneUser,
  normalizePhone,
  OTP_MAX_ATTEMPTS,
  otpMatches,
  savePhoneUserRecord,
  shadowEmail,
} from "@/lib/server/phone-auth";

interface OtpRow {
  id: string;
  otp_hash: string;
  attempts: number;
  expired: boolean;
}

export async function POST(request: Request) {
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
    const rows = await adminSql<OtpRow>(
      `SELECT id, otp_hash, attempts, expires_at < now() AS expired
       FROM public.phone_otps
       WHERE phone = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );
    const record = rows[0];

    if (!record || record.expired) {
      return Response.json(
        { error: "This code has expired. Please request a new one." },
        { status: 400 }
      );
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await adminSql("UPDATE public.phone_otps SET consumed_at = now() WHERE id = $1", [record.id]);
      return Response.json(
        { error: "Too many attempts. Please request a new code." },
        { status: 429 }
      );
    }
    if (!otpMatches(phone, otp, record.otp_hash)) {
      await adminSql("UPDATE public.phone_otps SET attempts = attempts + 1 WHERE id = $1", [
        record.id,
      ]);
      return Response.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }

    await adminSql("UPDATE public.phone_otps SET consumed_at = now() WHERE id = $1", [record.id]);

    const name = typeof body.name === "string" ? body.name.trim() || undefined : undefined;
    const userId = await ensurePhoneUser(phone, name);
    await savePhoneUserRecord(userId, phone, name);

    // Credentials for the SDK to open a native session in the browser.
    // Only obtainable through a successfully verified OTP for this phone.
    return Response.json({
      email: shadowEmail(phone),
      password: derivePassword(phone),
    });
  } catch (error) {
    console.error("verify-otp failed:", error);
    return Response.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}
