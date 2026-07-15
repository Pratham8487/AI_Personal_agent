/**
 * Google OAuth for SIGN-IN (openid email profile) — distinct from the Gmail
 * integration flow in gmail-oauth.ts, which requests Gmail scopes for an
 * already signed-in user. Same Google OAuth client, different redirect URI:
 *   <origin>/api/auth/google/callback   (register it in Google Cloud console)
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

/** Nonce cookie that pins the OAuth `state` param to this browser. */
export const OAUTH_STATE_COOKIE = "aster_oauth_state";

export function googleSignInConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function signInRedirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

export function buildSignInUrl(origin: string, state: string): string {
  if (!CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not set.");
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: signInRedirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export async function exchangeSignInCode(
  code: string,
  origin: string
): Promise<{ access_token: string }> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.");
  }
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: signInRedirectUri(origin),
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google token request failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as { access_token: string };
}

export type GoogleProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo request failed (${res.status})`);
  }
  return (await res.json()) as GoogleProfile;
}
