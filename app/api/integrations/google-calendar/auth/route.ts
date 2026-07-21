import { buildAuthUrl, googleOauthConfigured } from "@/lib/server/google-oauth";
import { getSessionUser } from "@/lib/server/session";

/**
 * Starts the Google OAuth consent flow for Calendar. The browser navigates
 * here directly, so failures redirect back to /integrations with an error code
 * instead of JSON. The user is derived from the session cookie, never from the
 * query string.
 *
 * When Gmail is already connected this is incremental: buildAuthUrl sets
 * include_granted_scopes, so Google only asks for the Calendar scopes and the
 * existing refresh token keeps working for both.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getSessionUser();
  if (!user) {
    return Response.redirect(new URL("/sign-in", request.url), 302);
  }
  if (!googleOauthConfigured()) {
    return Response.redirect(
      new URL(
        "/integrations?int_error=not_configured&provider=google-calendar",
        request.url,
      ),
      302,
    );
  }
  return Response.redirect(
    await buildAuthUrl(user.id, url.origin, "google-calendar"),
    302,
  );
}
