import { createHmac, timingSafeEqual } from "crypto";
import { adminSql } from "./db";

/**
 * Shared Google OAuth for every Google-backed integration (Gmail, Calendar).
 *
 * One grant per user lives in google_oauth_tokens. A second integration joins
 * that grant through incremental authorization (include_granted_scopes=true),
 * so a user already connected to Gmail only consents to the new scopes and
 * both apps keep working off the same refresh token.
 *
 * Sensitive scopes cap this client's consent screen at 100 test users until
 * Google verifies it. Sign-in deliberately uses a different client (see
 * google-signin.ts) so that cap never reaches the login flow.
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const STATE_SECRET = process.env.PHONE_AUTH_SECRET!;

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/** Integration ids (as stored in user_integrations) backed by a Google grant. */
export const GOOGLE_PROVIDERS = ["gmail", "google-calendar"] as const;

export type GoogleProvider = (typeof GOOGLE_PROVIDERS)[number];

/**
 * Scopes requested per integration. Calendar's set is what the official
 * Calendar MCP server needs: calendar.events covers read + create/update/
 * delete/respond, calendarlist.readonly backs list_calendars, and
 * events.freebusy backs suggest_time.
 */
const SCOPES: Record<GoogleProvider, string[]> = {
  gmail: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels",
  ],
  "google-calendar": [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events.freebusy",
  ],
};

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super(
      "Google is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.",
    );
    this.name = "GoogleNotConfiguredError";
  }
}

export class GoogleNotConnectedError extends Error {
  constructor(message = "Google is not connected. Connect it from the Integrations page.") {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

export function googleOauthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function stateSignature(userId: string, provider: GoogleProvider): string {
  return createHmac("sha256", STATE_SECRET)
    .update(`google-oauth:${provider}:${userId}`)
    .digest("hex");
}

/** OAuth `state` = "<userId>.<hmac>" so the callback can trust the user id. */
export function signState(userId: string, provider: GoogleProvider): string {
  return `${userId}.${stateSignature(userId, provider)}`;
}

export function verifyState(
  state: string,
  provider: GoogleProvider,
): string | null {
  const [userId, signature] = state.split(".");
  if (!userId || !signature || !isUuid(userId)) return null;
  const expected = Buffer.from(stateSignature(userId, provider), "hex");
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "hex");
  } catch {
    return null;
  }
  if (actual.length !== expected.length) return null;
  return timingSafeEqual(actual, expected) ? userId : null;
}

export function redirectUri(origin: string, provider: GoogleProvider): string {
  return `${origin}/api/integrations/${provider}/callback`;
}

async function storedRefreshToken(userId: string): Promise<boolean> {
  const rows = await adminSql<{ present: boolean }>(
    `SELECT refresh_token IS NOT NULL AS present
     FROM public.google_oauth_tokens WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.present === true;
}

/**
 * Consent URL for one integration.
 *
 * `include_granted_scopes` makes this incremental: the resulting grant is the
 * union of what the user has already approved plus this provider's scopes.
 * `prompt=consent` is only forced when we have no refresh token yet — Google
 * withholds a refresh token on repeat consents, so forcing it every time would
 * needlessly re-prompt for scopes the user already granted.
 */
export async function buildAuthUrl(
  userId: string,
  origin: string,
  provider: GoogleProvider,
): Promise<string> {
  if (!CLIENT_ID) throw new GoogleNotConfiguredError();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(origin, provider),
    response_type: "code",
    scope: SCOPES[provider].join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    state: signState(userId, provider),
  });
  if (!(await storedRefreshToken(userId))) params.set("prompt", "consent");
  return `${AUTH_ENDPOINT}?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

async function requestTokens(
  body: Record<string, string>,
): Promise<TokenResponse> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new GoogleNotConfiguredError();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      ...body,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google token request failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(
  code: string,
  origin: string,
  provider: GoogleProvider,
): Promise<TokenResponse> {
  return requestTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(origin, provider),
  });
}

/**
 * google_oauth_tokens references public.users, so guarantee the row exists
 * before saving tokens. Signup writes public.users directly, so this is only
 * a FK guard for edge cases.
 */
async function ensureUserRecord(userId: string): Promise<void> {
  await adminSql(
    `INSERT INTO public.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [userId],
  );
}

/**
 * Upserts the shared grant. `provider` only supplies a scope fallback for a
 * first insert; refresh responses carry no provider, and their scope is
 * COALESCEd so a terse response can never shrink the recorded scope union.
 */
export async function saveTokens(
  userId: string,
  tokens: TokenResponse,
  provider?: GoogleProvider,
): Promise<void> {
  await ensureUserRecord(userId);
  await adminSql(
    `INSERT INTO public.google_oauth_tokens (user_id, access_token, refresh_token, expires_at, scope)
     VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, public.google_oauth_tokens.refresh_token),
       expires_at = EXCLUDED.expires_at,
       scope = COALESCE(EXCLUDED.scope, public.google_oauth_tokens.scope),
       updated_at = now()`,
    [
      userId,
      tokens.access_token,
      tokens.refresh_token ?? null,
      String(tokens.expires_in),
      tokens.scope ?? (provider ? SCOPES[provider].join(" ") : null),
    ],
  );
}

/** Upserts one provider row in user_integrations (RLS bypassed via admin). */
export async function markIntegrationStatus(
  userId: string,
  provider: GoogleProvider,
  status: "connected" | "disconnected",
): Promise<void> {
  await adminSql(
    `INSERT INTO public.user_integrations (user_id, provider, status, connected_at)
     VALUES ($1, $2, $3, CASE WHEN $3 = 'connected' THEN now() END)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       status = EXCLUDED.status,
       connected_at = EXCLUDED.connected_at,
       updated_at = now()`,
    [userId, provider, status],
  );
}

/** True when the user still has another Google integration switched on. */
async function otherGoogleProviderConnected(
  userId: string,
  provider: GoogleProvider,
): Promise<boolean> {
  const others = GOOGLE_PROVIDERS.filter((id) => id !== provider);
  const rows = await adminSql<{ provider: string }>(
    `SELECT provider FROM public.user_integrations
     WHERE user_id = $1 AND status = 'connected' AND provider = ANY($2)`,
    [userId, others],
  );
  return rows.length > 0;
}

/**
 * Turns one integration off.
 *
 * The grant is shared, and Google can only revoke it whole — revoking on every
 * disconnect would silently break the user's other Google app. So the tokens
 * are dropped and revoked only once the last Google integration goes away.
 * The trade-off: disconnecting one app while another stays connected leaves
 * those scopes granted at Google; the app simply stops using them.
 */
export async function disconnectGoogleProvider(
  userId: string,
  provider: GoogleProvider,
): Promise<void> {
  await markIntegrationStatus(userId, provider, "disconnected");
  if (await otherGoogleProviderConnected(userId, provider)) return;

  const rows = await adminSql<{ access_token: string }>(
    "DELETE FROM public.google_oauth_tokens WHERE user_id = $1 RETURNING access_token",
    [userId],
  );
  const token = rows[0]?.access_token;
  if (token) {
    // Best-effort revocation; a failure just leaves the grant to expire.
    await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
      method: "POST",
    }).catch(() => {});
  }
}

/** Returns a usable access token, refreshing through Google when expired. */
export async function getValidAccessToken(userId: string): Promise<string> {
  const rows = await adminSql<{
    access_token: string;
    refresh_token: string | null;
    expired: boolean;
  }>(
    `SELECT access_token, refresh_token, (expires_at < now() + interval '60 seconds') AS expired
     FROM public.google_oauth_tokens WHERE user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new GoogleNotConnectedError();
  if (!row.expired) return row.access_token;
  if (!row.refresh_token) throw new GoogleNotConnectedError();

  let tokens: TokenResponse;
  try {
    tokens = await requestTokens({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    });
  } catch (error) {
    if (error instanceof GoogleNotConfiguredError) throw error;
    // The grant is gone (revoked from the Google account page, or expired).
    // Drop the dead row so the next connect asks for consent again and gets a
    // fresh refresh token — otherwise reconnecting would silently re-use it.
    console.error("Google token refresh failed; clearing the grant:", error);
    await adminSql("DELETE FROM public.google_oauth_tokens WHERE user_id = $1", [
      userId,
    ]);
    throw new GoogleNotConnectedError(
      "Your Google connection expired. Reconnect it from the Integrations page.",
    );
  }
  // The refresh response omits refresh_token; COALESCE keeps the stored one.
  await saveTokens(userId, tokens);
  return tokens.access_token;
}
