import {
  buildAuthUrl,
  microsoftOauthConfigured,
  redirectWithVerifier,
} from "@/lib/server/microsoft-oauth";
import { getSessionUser } from "@/lib/server/session";

/**
 * Starts the Microsoft Entra consent flow for Outlook. The browser navigates
 * here directly, so failures redirect back to /integrations with an error code
 * instead of JSON. The user is derived from the session cookie, never from the
 * query string.
 *
 * Only the OIDC scopes are requested at this point: every Work IQ scope embeds
 * the tenant GUID, which is not known until the id_token comes back. The
 * callback picks up from there and acquires the per-resource tokens.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getSessionUser();
  if (!user) {
    return Response.redirect(new URL("/sign-in", request.url), 302);
  }
  if (!microsoftOauthConfigured()) {
    return Response.redirect(
      new URL(
        "/integrations?int_error=not_configured&provider=outlook",
        request.url,
      ),
      302,
    );
  }

  const { url: authUrl, verifier } = await buildAuthUrl(user.id, url.origin);
  return redirectWithVerifier(authUrl, verifier);
}
