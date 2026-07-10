import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { PHONE_SHADOW_DOMAIN } from "@/lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!;
const ADMIN_KEY = process.env.INSFORGE_ADMIN_API_KEY!;
const OTP_SECRET = process.env.PHONE_AUTH_SECRET!;

export const OTP_TTL_MINUTES = 5;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

/** Validates and normalizes a phone number to E.164 (+15551234567). */
export function normalizePhone(input: string): string | null {
  const phone = input.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
}

/**
 * Phone users are backed by an InsForge email/password account under a
 * synthetic address. The password is derived from a server-only secret,
 * so it can only be obtained through a verified OTP exchange.
 */
export function shadowEmail(phone: string): string {
  return `p${phone.slice(1)}@${PHONE_SHADOW_DOMAIN}`;
}

export function derivePassword(phone: string): string {
  return createHmac("sha256", OTP_SECRET).update(`pw:${phone}`).digest("hex");
}

function hashOtp(phone: string, otp: string): string {
  return createHmac("sha256", OTP_SECRET).update(`otp:${phone}:${otp}`).digest("hex");
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function otpMatches(phone: string, otp: string, storedHash: string): boolean {
  const actual = Buffer.from(hashOtp(phone, otp), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Runs SQL against InsForge with the project admin key. Server-side only. */
export async function adminSql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const request = () =>
    fetch(`${BASE_URL}/api/database/advance/rawsql`, {
      method: "POST",
      headers: { "x-api-key": ADMIN_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ query, params }),
      signal: AbortSignal.timeout(10_000),
    });
  let res: Response;
  try {
    res = await request();
  } catch {
    // An idle keep-alive connection to InsForge can go stale and hang until
    // the gateway 504s (~60s). Abort at 10s and retry on a fresh connection.
    res = await request();
  }
  if (!res.ok) {
    throw new Error(`InsForge SQL request failed (${res.status})`);
  }
  const result = (await res.json()) as { rows: T[] };
  return result.rows;
}

/** Invalidates all active OTPs for the phone. */
export async function invalidateOtps(phone: string): Promise<void> {
  await adminSql(
    "UPDATE public.phone_otps SET consumed_at = now() WHERE phone = $1 AND consumed_at IS NULL",
    [phone]
  );
}

/** Stores a fresh OTP for the phone, invalidating any previous ones. */
export async function storeOtp(phone: string, otp: string): Promise<void> {
  await invalidateOtps(phone);
  await adminSql(
    `INSERT INTO public.phone_otps (phone, otp_hash, expires_at)
     VALUES ($1, $2, now() + interval '${OTP_TTL_MINUTES} minutes')`,
    [phone, hashOtp(phone, otp)]
  );
}

export async function isRateLimited(phone: string): Promise<boolean> {
  const rows = await adminSql(
    `SELECT id FROM public.phone_otps
     WHERE phone = $1 AND consumed_at IS NULL
       AND created_at > now() - interval '${OTP_RESEND_SECONDS} seconds'
     LIMIT 1`,
    [phone]
  );
  return rows.length > 0;
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
 * Finds or creates the InsForge account backing this phone number and
 * returns its user id. New accounts are registered through the auth API
 * (so password hashing stays in InsForge) and marked verified via admin SQL,
 * since the synthetic address can never receive a verification email.
 */
export async function ensurePhoneUser(
  phone: string,
  name?: string
): Promise<string> {
  const email = shadowEmail(phone);

  const existing = await adminSql<{ id: string }>(
    "SELECT id FROM auth.users WHERE email = $1",
    [email]
  );
  if (existing.length > 0) return existing[0].id;

  const res = await fetch(`${BASE_URL}/api/auth/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: derivePassword(phone),
      name: name || undefined,
    }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`InsForge registration failed (${res.status})`);
  }

  const rows = await adminSql<{ id: string }>(
    "UPDATE auth.users SET email_verified = true WHERE email = $1 RETURNING id",
    [email]
  );
  if (rows.length === 0) throw new Error("Phone account was not created");
  return rows[0].id;
}

/** Upserts the phone user's record in the users table (RLS bypassed via admin). */
export async function savePhoneUserRecord(
  userId: string,
  phone: string,
  name?: string
): Promise<void> {
  await adminSql(
    `INSERT INTO public.users (id, email, name, phone, providers, verification_method, last_login_at)
     VALUES ($1, NULL, $2, $3, ARRAY['phone'], 'sms', now())
     ON CONFLICT (id) DO UPDATE SET
       phone = EXCLUDED.phone,
       name = COALESCE(EXCLUDED.name, public.users.name),
       verification_method = 'sms',
       last_login_at = now(),
       updated_at = now()`,
    [userId, name || null, phone]
  );
}
