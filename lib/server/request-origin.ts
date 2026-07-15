/**
 * CSRF guard for session-mutating routes: sameSite=lax already blocks cookie
 * attachment on cross-site POSTs; this adds an explicit Origin check as
 * belt-and-suspenders. Returns null when the request is acceptable, or a 403
 * response to send back.
 */
export function assertSameOrigin(request: Request): Response | null {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return Response.json({ error: "Cross-site request rejected." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    const requestOrigin = new URL(request.url).origin;
    if (origin !== requestOrigin) {
      return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
    }
  }
  return null;
}
