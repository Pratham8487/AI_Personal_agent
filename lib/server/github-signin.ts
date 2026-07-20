/**
 * GitHub OAuth for SIGN-IN (read:user user:email) — mirrors google-signin.ts.
 * Register the redirect URI in the GitHub OAuth App settings:
 *   <origin>/api/auth/github/callback
 */

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

const AUTH_ENDPOINT = "https://github.com/login/oauth/authorize";
const TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const USER_ENDPOINT = "https://api.github.com/user";
const EMAILS_ENDPOINT = "https://api.github.com/user/emails";

/** Nonce cookie that pins the OAuth `state` param to this browser. */
export const GITHUB_OAUTH_STATE_COOKIE = "aster_gh_oauth_state";

export function githubSignInConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function signInRedirectUri(origin: string): string {
  return `${origin}/api/auth/github/callback`;
}

export function buildSignInUrl(origin: string, state: string): string {
  if (!CLIENT_ID) throw new Error("GITHUB_CLIENT_ID is not set.");
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: signInRedirectUri(origin),
    scope: "read:user user:email",
    state,
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export async function exchangeSignInCode(
  code: string,
  origin: string
): Promise<{ access_token: string }> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set.");
  }
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: signInRedirectUri(origin),
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`GitHub token request failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  // GitHub reports errors (e.g. bad_verification_code) with a 200 status.
  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    throw new Error(`GitHub token request failed: ${data.error_description ?? data.error}`);
  }
  return { access_token: data.access_token };
}

export type GitHubProfile = {
  id: number;
  login: string;
  name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
};

function apiHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "aster-personal-assistant",
  };
}

export async function fetchGitHubProfile(accessToken: string): Promise<GitHubProfile> {
  const res = await fetch(USER_ENDPOINT, { headers: apiHeaders(accessToken) });
  if (!res.ok) {
    throw new Error(`GitHub user request failed (${res.status})`);
  }
  return (await res.json()) as GitHubProfile;
}

/**
 * The profile's `email` is the public one and is usually null. Fetch the
 * account's email list and return a VERIFIED address (primary preferred) —
 * only verified emails are safe to link accounts by.
 */
export async function fetchGitHubVerifiedEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(EMAILS_ENDPOINT, { headers: apiHeaders(accessToken) });
  if (!res.ok) return null;
  const emails = (await res.json()) as {
    email: string;
    primary: boolean;
    verified: boolean;
  }[];
  const verified = emails.filter((e) => e.verified);
  return (verified.find((e) => e.primary) ?? verified[0])?.email ?? null;
}
