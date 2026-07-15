import { adminSql } from "./db";
import { OTP_TTL_MINUTES } from "./otp";

/** Validates and normalizes a phone number to E.164 (+15551234567). */
export function normalizePhone(input: string): string | null {
  const phone = input.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
}

/** Sends the OTP over SMS via the messages.dev API (POST /v1/messages). */
export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  const apiKey = process.env.MESSAGES_DEV_API_KEY;
  const from = process.env.MESSAGES_DEV_FROM;
  if (!apiKey || !from) {
    throw new Error(
      "SMS is not configured. Set MESSAGES_DEV_API_KEY and MESSAGES_DEV_FROM in .env.local"
    );
  }

  const apiBase = process.env.MESSAGES_DEV_BASE_URL || "https://api.messages.dev/v1";
  const res = await fetch(`${apiBase}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: phone,
      text: `Your Aster verification code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`messages.dev send failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

/**
 * Finds or creates the local account for a verified phone number and returns
 * its user id. Phone accounts have no email or password; access is only ever
 * granted through a verified OTP exchange.
 */
export async function upsertPhoneUser(phone: string, name?: string): Promise<string> {
  const rows = await adminSql<{ id: string }>(
    `INSERT INTO public.users
       (phone, name, providers, verification_method, email_verified, contact_verified, last_login_at)
     VALUES ($1, $2, ARRAY['phone'], 'sms', false, true, now())
     ON CONFLICT (phone) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, public.users.name),
       contact_verified = true,
       last_login_at = now(),
       updated_at = now()
     RETURNING id`,
    [phone, name || null]
  );
  return rows[0].id;
}
