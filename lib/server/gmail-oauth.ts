import { createHmac, timingSafeEqual } from "crypto";
import { adminSql } from "./db";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const STATE_SECRET = process.env.PHONE_AUTH_SECRET!;

const GMAIL_SCOPE = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
].join(" ");
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export class GmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Gmail is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.",
    );
    this.name = "GmailNotConfiguredError";
  }
}

export class GmailNotConnectedError extends Error {
  constructor() {
    super("Gmail is not connected. Connect it from the Integrations page.");
    this.name = "GmailNotConnectedError";
  }
}

export function gmailOauthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function stateSignature(userId: string): string {
  return createHmac("sha256", STATE_SECRET)
    .update(`gmail-oauth:${userId}`)
    .digest("hex");
}

/** OAuth `state` = "<userId>.<hmac>" so the callback can trust the user id. */
export function signState(userId: string): string {
  return `${userId}.${stateSignature(userId)}`;
}

export function verifyState(state: string): string | null {
  const [userId, signature] = state.split(".");
  if (!userId || !signature || !isUuid(userId)) return null;
  const expected = Buffer.from(stateSignature(userId), "hex");
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "hex");
  } catch {
    return null;
  }
  if (actual.length !== expected.length) return null;
  return timingSafeEqual(actual, expected) ? userId : null;
}

export function redirectUri(origin: string): string {
  return `${origin}/api/integrations/gmail/callback`;
}

export function buildAuthUrl(userId: string, origin: string): string {
  if (!CLIENT_ID) throw new GmailNotConfiguredError();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: signState(userId),
  });
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
  if (!CLIENT_ID || !CLIENT_SECRET) throw new GmailNotConfiguredError();
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
): Promise<TokenResponse> {
  return requestTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(origin),
  });
}

/**
 * gmail_oauth_tokens references public.users, so guarantee the row exists
 * before saving tokens. Signup writes public.users directly, so this is only
 * a FK guard for edge cases.
 */
async function ensureUserRecord(userId: string): Promise<void> {
  await adminSql(
    `INSERT INTO public.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [userId],
  );
}

export async function saveTokens(
  userId: string,
  tokens: TokenResponse,
): Promise<void> {
  await ensureUserRecord(userId);
  await adminSql(
    `INSERT INTO public.gmail_oauth_tokens (user_id, access_token, refresh_token, expires_at, scope)
     VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, public.gmail_oauth_tokens.refresh_token),
       expires_at = EXCLUDED.expires_at,
       scope = EXCLUDED.scope,
       updated_at = now()`,
    [
      userId,
      tokens.access_token,
      tokens.refresh_token ?? null,
      String(tokens.expires_in),
      tokens.scope ?? GMAIL_SCOPE,
    ],
  );
}

/** Upserts the user's gmail row in user_integrations (RLS bypassed via admin). */
export async function markGmailStatus(
  userId: string,
  status: "connected" | "disconnected",
): Promise<void> {
  await adminSql(
    `INSERT INTO public.user_integrations (user_id, provider, status, connected_at)
     VALUES ($1, 'gmail', $2, CASE WHEN $2 = 'connected' THEN now() END)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       status = EXCLUDED.status,
       connected_at = EXCLUDED.connected_at,
       updated_at = now()`,
    [userId, status],
  );
}

export async function deleteTokens(userId: string): Promise<void> {
  const rows = await adminSql<{ access_token: string }>(
    "DELETE FROM public.gmail_oauth_tokens WHERE user_id = $1 RETURNING access_token",
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
     FROM public.gmail_oauth_tokens WHERE user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new GmailNotConnectedError();
  if (!row.expired) return row.access_token;
  if (!row.refresh_token) throw new GmailNotConnectedError();

  const tokens = await requestTokens({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });
  await saveTokens(userId, tokens);
  return tokens.access_token;
}
