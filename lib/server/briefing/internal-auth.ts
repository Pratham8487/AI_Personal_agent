import { timingSafeEqual } from "crypto";

/**
 * Guards the internal scheduler endpoints (claim-due, run) that Trigger.dev
 * tasks call. They are secret-authenticated, not user-authenticated.
 */
export function checkInternalSecret(request: Request): Response | null {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return Response.json(
      { error: "INTERNAL_API_SECRET is not configured.", code: "not_configured" },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-internal-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
