import {
  buildAuthUrl,
  gmailOauthConfigured,
  isUuid,
} from "@/lib/server/gmail-oauth";

/**
 * Starts the Google OAuth consent flow. The browser navigates here directly,
 * so failures redirect back to /integrations with an error code instead of JSON.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const uid = url.searchParams.get("uid") ?? "";
  if (!isUuid(uid)) {
    return Response.redirect(
      new URL("/integrations?gmail_error=invalid_user", request.url),
      302,
    );
  }
  if (!gmailOauthConfigured()) {
    return Response.redirect(
      new URL("/integrations?gmail_error=not_configured", request.url),
      302,
    );
  }
  return Response.redirect(buildAuthUrl(uid, url.origin), 302);
}
