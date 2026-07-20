/**
 * Structured auth logging. Every field that reaches a log line is either an
 * opaque id or passed through maskEmail() — raw addresses, OTP codes, hashes,
 * passwords and tokens must never appear here.
 */

export type AuthEvent =
  | "sign_in.password_ok"
  | "sign_in.password_failed"
  | "sign_in.account_disabled"
  | "sign_in.otp_sent"
  | "sign_in.otp_send_failed"
  | "sign_in.otp_throttled"
  | "verify_otp.success"
  | "verify_otp.expired"
  | "verify_otp.mismatch"
  | "verify_otp.too_many_attempts"
  | "verify_otp.account_disabled"
  | "verify_otp.user_missing";

/** `alice@example.com` → `a***e@example.com`; short locals collapse to `***`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `***${domain}`;
  return `${local[0]}***${local[local.length - 1]}${domain}`;
}

type AuthLogFields = {
  email?: string;
  userId?: string;
  /** Reason codes only — never the underlying error message from user input. */
  reason?: string;
};

/**
 * Failures log at error level so they surface in alerting; everything else is
 * informational. Callers pass the raw email — masking happens here so no call
 * site can forget.
 */
export function logAuthEvent(event: AuthEvent, fields: AuthLogFields = {}): void {
  const payload: Record<string, string> = { event };
  if (fields.email) payload.email = maskEmail(fields.email);
  if (fields.userId) payload.userId = fields.userId;
  if (fields.reason) payload.reason = fields.reason;

  const line = `auth ${JSON.stringify(payload)}`;
  if (event.endsWith("_failed") || event.endsWith("_missing")) console.error(line);
  else console.info(line);
}
