import { buildAuthUrl, gmailOauthConfigured } from "@/lib/server/gmail-oauth";
import { getSessionUser } from "@/lib/server/session";

/**
 * Starts the Google OAuth consent flow. The browser navigates here directly,
 * so failures redirect back to /integrations with an error code instead of JSON.
 * The user is derived from the session cookie, never from the query string.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getSessionUser();
  if (!user) {
    return Response.redirect(new URL("/sign-in", request.url), 302);
  }
  if (!gmailOauthConfigured()) {
    return Response.redirect(
      new URL(
        "/integrations?int_error=not_configured&provider=gmail",
        request.url,
      ),
      302,
    );
  }
  return Response.redirect(await buildAuthUrl(user.id, url.origin), 302);
}
