/** Validates and normalizes a phone number to E.164 (+15551234567). */
export function normalizePhone(input: string): string | null {
  const phone = input.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
}
