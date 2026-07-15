import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { adminSql } from "./db";

// Signs all OTP types (name predates the generic store; kept to avoid churn).
const OTP_SECRET = process.env.PHONE_AUTH_SECRET!;

export const OTP_TTL_MINUTES = 5;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpType =
  | "EMAIL_VERIFICATION"
  | "LOGIN"
  | "PASSWORD_RESET"
  | "PHONE_VERIFICATION";

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// The otp_type is part of the HMAC input so a code issued for one purpose
// can never be replayed for another.
function hashOtp(type: OtpType, target: string, otp: string): string {
  return createHmac("sha256", OTP_SECRET)
    .update(`otp:${type}:${target}:${otp}`)
    .digest("hex");
}

/** Deactivates all live codes for (type, target). */
export async function invalidateOtps(type: OtpType, target: string): Promise<void> {
  await adminSql(
    `UPDATE public.user_otp_verifications SET active = false
     WHERE otp_type = $1 AND target = $2 AND active`,
    [type, target]
  );
}

/**
 * Stores a fresh code, invalidating prior ones. Returns the stored hash so
 * password reset can mirror it into password_reset_requests.
 */
export async function storeOtp(
  type: OtpType,
  target: string,
  otp: string,
  userId?: string | null
): Promise<{ hash: string }> {
  const hash = hashOtp(type, target, otp);
  await invalidateOtps(type, target);
  await adminSql(
    `INSERT INTO public.user_otp_verifications
       (user_id, otp_type, target, otp_hash, max_attempts, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '${OTP_TTL_MINUTES} minutes')`,
    [userId ?? null, type, target, hash, OTP_MAX_ATTEMPTS]
  );
  return { hash };
}

/** True when a live code for (type, target) was created < OTP_RESEND_SECONDS ago. */
export async function isRateLimited(type: OtpType, target: string): Promise<boolean> {
  const rows = await adminSql(
    `SELECT id FROM public.user_otp_verifications
     WHERE otp_type = $1 AND target = $2 AND active
       AND created_at > now() - interval '${OTP_RESEND_SECONDS} seconds'
     LIMIT 1`,
    [type, target]
  );
  return rows.length > 0;
}

export type VerifyOtpResult =
  | { ok: true; userId: string | null }
  | { ok: false; reason: "expired" | "too_many_attempts" | "mismatch" };

type OtpRow = {
  id: string;
  user_id: string | null;
  otp_hash: string;
  attempt_count: number;
  max_attempts: number;
  expired: boolean;
};

/**
 * One-shot verification: expiry check, attempt cap (deactivates on breach),
 * timing-safe compare (increments attempt_count on mismatch), consumes the
 * code on success (verified_at set, active=false).
 */
export async function verifyOtp(
  type: OtpType,
  target: string,
  otp: string
): Promise<VerifyOtpResult> {
  const rows = await adminSql<OtpRow>(
    `SELECT id, user_id, otp_hash, attempt_count, max_attempts,
            expires_at < now() AS expired
     FROM public.user_otp_verifications
     WHERE otp_type = $1 AND target = $2 AND active
     ORDER BY created_at DESC LIMIT 1`,
    [type, target]
  );
  const record = rows[0];
  if (!record || record.expired) return { ok: false, reason: "expired" };

  if (record.attempt_count >= record.max_attempts) {
    await adminSql(
      `UPDATE public.user_otp_verifications SET active = false WHERE id = $1`,
      [record.id]
    );
    return { ok: false, reason: "too_many_attempts" };
  }

  const actual = Buffer.from(hashOtp(type, target, otp), "hex");
  const expected = Buffer.from(record.otp_hash, "hex");
  const matches = actual.length === expected.length && timingSafeEqual(actual, expected);
  if (!matches) {
    await adminSql(
      `UPDATE public.user_otp_verifications SET attempt_count = attempt_count + 1 WHERE id = $1`,
      [record.id]
    );
    return { ok: false, reason: "mismatch" };
  }

  await adminSql(
    `UPDATE public.user_otp_verifications
     SET verified_at = now(), active = false WHERE id = $1`,
    [record.id]
  );
  return { ok: true, userId: record.user_id };
}
