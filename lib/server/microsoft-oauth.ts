import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { adminSql } from "./db";

/**
 * Shared Microsoft Entra grant behind the Outlook integration.
 *
 * Structurally this is google-oauth.ts, with one difference Entra forces on us:
 * an access token is scoped to exactly one *resource* and can never span two.
 * Outlook speaks to three official Work IQ MCP servers, so a single
 * cross-resource refresh token (microsoft_oauth_tokens) is redeemed separately
 * per resource (microsoft_access_tokens).
 *
 * Connecting is therefore two-phase, because both the MCP endpoint URLs and
 * their OAuth scopes embed the tenant GUID, which is unknown until the user
 * signs in:
 *
 *   1. /authorize against "organizations" with openid+profile+offline_access.
 *      The id_token's `tid` claim is the tenant; `preferred_username` the account.
 *   2. Redeem the refresh token per resource against /{tid}/. A resource whose
 *      permission has not been consented answers AADSTS65001, which sends the
 *      user through one more /authorize for just that scope — the direct
 *      analogue of Google's include_granted_scopes incremental authorization.
 *
 * "organizations" (not "common") is what Microsoft's own protected-resource
 * metadata names as the authorization server, so personal Microsoft accounts
 * are rejected at the identity layer. Work IQ additionally requires a
 * Microsoft 365 Copilot license and tenant admin consent.
 */

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const STATE_SECRET = process.env.PHONE_AUTH_SECRET!;

const AUTHORITY = "https://login.microsoftonline.com";
/** Work/school accounts only — Work IQ does not serve personal accounts. */
const SIGN_IN_TENANT = "organizations";

/** Integration ids (as stored in user_integrations) backed by this grant. */
export const MICROSOFT_PROVIDERS = ["outlook"] as const;
export type MicrosoftProvider = (typeof MICROSOFT_PROVIDERS)[number];

/** The three official Work IQ MCP servers Outlook is built on. */
export const MICROSOFT_RESOURCES = ["mail", "calendar", "workiq"] as const;
export type MicrosoftResource = (typeof MICROSOFT_RESOURCES)[number];

/** Mail and Calendar are what "Outlook" means; workiq only fills the gaps. */
export const REQUIRED_RESOURCES: readonly MicrosoftResource[] = ["mail", "calendar"];

const AGENT365 = "https://agent365.svc.cloud.microsoft";

/**
 * Fallback scopes, used only when the protected-resource document cannot be
 * read. The live values come from discovery (see resourceScope).
 */
const FALLBACK_SCOPES: Record<MicrosoftResource, (tenantId: string) => string> = {
  mail: (tid) => `${mcpEndpoint("mail", tid)}/.default`,
  calendar: (tid) => `${mcpEndpoint("calendar", tid)}/.default`,
  workiq: () => "api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask",
};

export const RESOURCE_LABELS: Record<MicrosoftResource, string> = {
  mail: "Work IQ Mail",
  calendar: "Work IQ Calendar",
  workiq: "Work IQ",
};

/** Streamable-HTTP MCP endpoint for one resource in one tenant. */
export function mcpEndpoint(
  resource: MicrosoftResource,
  tenantId: string,
): string {
  if (resource === "workiq") return "https://workiq.svc.cloud.microsoft/mcp";
  const server = resource === "mail" ? "mcp_MailTools" : "mcp_CalendarTools";
  return `${AGENT365}/agents/tenants/${tenantId}/servers/${server}`;
}

// --- errors -----------------------------------------------------------------

export class MicrosoftNotConfiguredError extends Error {
  constructor() {
    super(
      "Outlook is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in .env.local.",
    );
    this.name = "MicrosoftNotConfiguredError";
  }
}

export class MicrosoftNotConnectedError extends Error {
  constructor(
    message = "Outlook is not connected. Connect it from the Integrations page.",
  ) {
    super(message);
    this.name = "MicrosoftNotConnectedError";
  }
}

/**
 * The account cannot use Work IQ at all. Distinct from "not connected": no
 * amount of reconnecting fixes it, so the UI explains the requirement instead
 * of offering a retry.
 */
export type IneligibleReason =
  | "work_account_required"
  | "copilot_license_required"
  | "admin_consent_required"
  | "work_iq_disabled";

export class MicrosoftNotEligibleError extends Error {
  readonly reason: IneligibleReason;
  constructor(reason: IneligibleReason, message: string) {
    super(message);
    this.name = "MicrosoftNotEligibleError";
    this.reason = reason;
  }
}

/** One resource still needs consent; the caller sends the user to /authorize. */
export class MicrosoftConsentRequiredError extends Error {
  readonly resource: MicrosoftResource;
  constructor(resource: MicrosoftResource) {
    super(`${RESOURCE_LABELS[resource]} needs your permission.`);
    this.name = "MicrosoftConsentRequiredError";
    this.resource = resource;
  }
}

export function microsoftOauthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// --- state + PKCE -----------------------------------------------------------

/**
 * OAuth `state` = "<userId>.<stage>.<hmac>". The stage distinguishes the
 * initial sign-in from an incremental consent round trip, so the callback
 * knows which half of the flow it is finishing.
 */
type Stage = "connect" | MicrosoftResource;

function stateSignature(userId: string, stage: Stage): string {
  return createHmac("sha256", STATE_SECRET)
    .update(`microsoft-oauth:${stage}:${userId}`)
    .digest("hex");
}

export function signState(userId: string, stage: Stage): string {
  return `${userId}.${stage}.${stateSignature(userId, stage)}`;
}

export function verifyState(
  state: string,
): { userId: string; stage: Stage } | null {
  const [userId, stage, signature] = state.split(".");
  if (!userId || !stage || !signature || !isUuid(userId)) return null;
  if (stage !== "connect" && !MICROSOFT_RESOURCES.includes(stage as MicrosoftResource)) {
    return null;
  }
  const expected = Buffer.from(stateSignature(userId, stage as Stage), "hex");
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "hex");
  } catch {
    return null;
  }
  if (actual.length !== expected.length) return null;
  return timingSafeEqual(actual, expected)
    ? { userId, stage: stage as Stage }
    : null;
}

export const PKCE_COOKIE = "aster_ms_pkce";

/** Scoped to this integration's routes, so it rides nowhere else in the app. */
const PKCE_PATH = "/api/integrations/outlook";

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function pkceCookie(value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${PKCE_COOKIE}=${value}; Path=${PKCE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/**
 * Redirects to Microsoft while parking the PKCE verifier in a short-lived
 * httpOnly cookie, so it survives the round trip without ever being readable
 * by scripts.
 */
export function redirectWithVerifier(
  location: string,
  verifier: string,
): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Set-Cookie": pkceCookie(verifier, 600) },
  });
}

/** Redirects back into the app, expiring the one-shot verifier cookie. */
export function redirectClearingVerifier(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Set-Cookie": pkceCookie("", 0) },
  });
}

export function readVerifier(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${PKCE_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function redirectUri(origin: string): string {
  return `${origin}/api/integrations/outlook/callback`;
}

// --- protected-resource discovery -------------------------------------------

type ResourceMetadata = {
  scopes_supported?: string[];
  authorization_servers?: string[];
};

const SCOPE_TTL_MS = 60 * 60 * 1000;
const scopeCache = new Map<string, { scope: string; fetchedAt: number }>();

/**
 * RFC 9728: the metadata for resource https://host/path lives at
 * https://host/.well-known/oauth-protected-resource/path.
 */
function metadataUrl(endpoint: string): string {
  const url = new URL(endpoint);
  return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
}

/**
 * The scope to request for one resource, read from the server's own
 * protected-resource document rather than hardcoded, so a change to
 * Microsoft's URI scheme does not need a code change. Falls back to the known
 * form when discovery is unreachable.
 */
export async function resourceScope(
  resource: MicrosoftResource,
  tenantId: string,
): Promise<string> {
  const endpoint = mcpEndpoint(resource, tenantId);
  const cached = scopeCache.get(endpoint);
  if (cached && Date.now() - cached.fetchedAt < SCOPE_TTL_MS) return cached.scope;

  let scope = FALLBACK_SCOPES[resource](tenantId);
  try {
    const res = await fetch(metadataUrl(endpoint), {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const metadata = (await res.json()) as ResourceMetadata;
      const discovered = metadata.scopes_supported?.find(
        (entry) => entry !== "openid" && entry !== "profile" && entry !== "offline_access",
      );
      if (discovered) scope = discovered;
    }
  } catch (error) {
    console.error(`Work IQ resource metadata unreachable (${resource}):`, error);
  }
  scopeCache.set(endpoint, { scope, fetchedAt: Date.now() });
  return scope;
}

// --- token endpoint ---------------------------------------------------------

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
};

type EntraError = {
  error?: string;
  error_description?: string;
  error_codes?: number[];
};

/**
 * AADSTS codes worth acting on rather than showing raw to the user.
 *
 *   65001  the user (or admin) has not consented to this scope
 *   65004  the user declined the consent prompt
 *   50020  the account does not exist in the tenant — a personal or foreign account
 *   50128  no tenant for this account
 *   700016 the app is not provisioned in this directory: needs admin consent
 *   500011 the resource principal is missing — Work IQ was never enabled here
 */
const CONSENT_CODES = new Set([65001, 65004]);
const WORK_ACCOUNT_CODES = new Set([50020, 50128]);
const ADMIN_CONSENT_CODES = new Set([700016]);
const WORK_IQ_DISABLED_CODES = new Set([500011]);

function classifyEntraError(
  body: EntraError,
  resource: MicrosoftResource,
): Error {
  const codes = body.error_codes ?? [];
  const description = body.error_description ?? body.error ?? "";
  const has = (set: Set<number>) => codes.some((code) => set.has(code));

  // Recoverable: one more trip through /authorize collects the missing scope.
  if (has(CONSENT_CODES) || body.error === "consent_required") {
    return new MicrosoftConsentRequiredError(resource);
  }
  if (has(WORK_ACCOUNT_CODES)) {
    return new MicrosoftNotEligibleError(
      "work_account_required",
      "Outlook needs a Microsoft 365 work or school account. Personal Microsoft accounts are not supported by Microsoft's Work IQ MCP servers.",
    );
  }
  if (has(ADMIN_CONSENT_CODES)) {
    return new MicrosoftNotEligibleError(
      "admin_consent_required",
      "A Microsoft 365 administrator has to grant this app consent before Outlook can connect.",
    );
  }
  if (has(WORK_IQ_DISABLED_CODES)) {
    return new MicrosoftNotEligibleError(
      "work_iq_disabled",
      "Work IQ is not enabled in this Microsoft 365 tenant. An administrator has to turn it on.",
    );
  }
  if (body.error === "interaction_required" || body.error === "invalid_grant") {
    return new MicrosoftNotConnectedError(
      "Your Microsoft connection expired. Reconnect Outlook from the Integrations page.",
    );
  }
  return new Error(`Microsoft token request failed: ${description.slice(0, 300)}`);
}

async function requestTokens(
  tenant: string,
  body: Record<string, string>,
  resource: MicrosoftResource = "mail",
): Promise<TokenResponse> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new MicrosoftNotConfiguredError();
  const res = await fetch(`${AUTHORITY}/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      ...body,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let parsed: EntraError = {};
    try {
      parsed = JSON.parse(text) as EntraError;
    } catch {
      throw new Error(
        `Microsoft token request failed (${res.status}): ${text.slice(0, 200)}`,
      );
    }
    throw classifyEntraError(parsed, resource);
  }
  return JSON.parse(text) as TokenResponse;
}

/** Reads the payload of an id_token without verifying it. */
function readIdToken(idToken: string): { tid?: string; preferred_username?: string } {
  const payload = idToken.split(".")[1];
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

// --- authorize URLs ---------------------------------------------------------

type Grant = {
  tenant_id: string;
  username: string | null;
  refresh_token: string;
};

async function loadGrant(userId: string): Promise<Grant | null> {
  const rows = await adminSql<Grant>(
    `SELECT tenant_id, username, refresh_token
     FROM public.microsoft_oauth_tokens WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getGrant(
  userId: string,
): Promise<{ tenantId: string; username: string | null } | null> {
  const grant = await loadGrant(userId);
  return grant ? { tenantId: grant.tenant_id, username: grant.username } : null;
}

/**
 * Phase-1 consent URL. Only the OIDC scopes are requested here: the tenant is
 * still unknown, and every Work IQ scope embeds it.
 *
 * When a grant already exists the account is passed as `login_hint` and no
 * `prompt` is sent, so Entra reuses the existing session silently instead of
 * re-asking who the user is — the same reasoning as google-oauth.ts only
 * forcing prompt=consent when it has no refresh token yet.
 */
export async function buildAuthUrl(
  userId: string,
  origin: string,
): Promise<{ url: string; verifier: string }> {
  if (!CLIENT_ID) throw new MicrosoftNotConfiguredError();
  const grant = await loadGrant(userId);
  const { verifier, challenge } = createPkcePair();

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    response_mode: "query",
    scope: "openid profile offline_access",
    state: signState(userId, "connect"),
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (grant?.username) params.set("login_hint", grant.username);
  else params.set("prompt", "select_account");

  return {
    url: `${AUTHORITY}/${SIGN_IN_TENANT}/oauth2/v2.0/authorize?${params}`,
    verifier,
  };
}

/**
 * Incremental consent for one resource, against the now-known tenant. Only
 * this resource's scope is requested; everything already granted stays granted.
 */
export async function buildIncrementalAuthUrl(
  userId: string,
  origin: string,
  resource: MicrosoftResource,
): Promise<{ url: string; verifier: string } | null> {
  if (!CLIENT_ID) throw new MicrosoftNotConfiguredError();
  const grant = await loadGrant(userId);
  if (!grant) return null;

  const { verifier, challenge } = createPkcePair();
  const scope = await resourceScope(resource, grant.tenant_id);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    response_mode: "query",
    scope: `${scope} offline_access`,
    state: signState(userId, resource),
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (grant.username) params.set("login_hint", grant.username);

  return {
    url: `${AUTHORITY}/${grant.tenant_id}/oauth2/v2.0/authorize?${params}`,
    verifier,
  };
}

// --- persistence ------------------------------------------------------------

async function ensureUserRecord(userId: string): Promise<void> {
  await adminSql(
    `INSERT INTO public.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [userId],
  );
}

/**
 * Upserts the grant. Entra rotates the refresh token on every redemption, so
 * a response that carries one always wins; COALESCE keeps the stored one when
 * a response omits it.
 */
async function saveGrant(
  userId: string,
  tokens: TokenResponse,
  tenantId: string,
  username: string | null,
): Promise<void> {
  await ensureUserRecord(userId);
  await adminSql(
    `INSERT INTO public.microsoft_oauth_tokens (user_id, tenant_id, username, refresh_token, scope)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       username = COALESCE(EXCLUDED.username, public.microsoft_oauth_tokens.username),
       refresh_token = COALESCE(EXCLUDED.refresh_token, public.microsoft_oauth_tokens.refresh_token),
       scope = COALESCE(EXCLUDED.scope, public.microsoft_oauth_tokens.scope),
       updated_at = now()`,
    [userId, tenantId, username, tokens.refresh_token ?? null, tokens.scope ?? null],
  );
}

async function saveAccessToken(
  userId: string,
  resource: MicrosoftResource,
  tokens: TokenResponse,
): Promise<void> {
  await adminSql(
    `INSERT INTO public.microsoft_access_tokens (user_id, resource, access_token, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)
     ON CONFLICT (user_id, resource) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       expires_at = EXCLUDED.expires_at,
       updated_at = now()`,
    [userId, resource, tokens.access_token, String(tokens.expires_in)],
  );
}

/** Rotation only: keeps the newest refresh token without touching anything else. */
async function saveRotatedRefreshToken(
  userId: string,
  refreshToken: string | undefined,
): Promise<void> {
  if (!refreshToken) return;
  await adminSql(
    `UPDATE public.microsoft_oauth_tokens
     SET refresh_token = $2, updated_at = now() WHERE user_id = $1`,
    [userId, refreshToken],
  );
}

/** Upserts one provider row in user_integrations. */
export async function markIntegrationStatus(
  userId: string,
  provider: MicrosoftProvider,
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

// --- the flow ---------------------------------------------------------------

/**
 * Finishes phase 1: exchanges the code and records the grant. The tenant and
 * account come from the id_token, and are what every later call is addressed
 * with.
 */
export async function exchangeSignInCode(
  userId: string,
  code: string,
  origin: string,
  verifier: string,
): Promise<{ tenantId: string; username: string | null }> {
  const tokens = await requestTokens(SIGN_IN_TENANT, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(origin),
    code_verifier: verifier,
    scope: "openid profile offline_access",
  });

  const claims = tokens.id_token ? readIdToken(tokens.id_token) : {};
  const tenantId = claims.tid ?? "";
  if (!isUuid(tenantId)) {
    throw new MicrosoftNotEligibleError(
      "work_account_required",
      "Outlook needs a Microsoft 365 work or school account. Personal Microsoft accounts are not supported by Microsoft's Work IQ MCP servers.",
    );
  }
  const username = claims.preferred_username ?? null;
  await saveGrant(userId, tokens, tenantId, username);
  return { tenantId, username };
}

/**
 * Finishes an incremental-consent round trip: exchanges the code for this
 * resource's access token and stores the rotated refresh token.
 */
export async function exchangeResourceCode(
  userId: string,
  resource: MicrosoftResource,
  code: string,
  origin: string,
  verifier: string,
): Promise<void> {
  const grant = await loadGrant(userId);
  if (!grant) throw new MicrosoftNotConnectedError();
  const scope = await resourceScope(resource, grant.tenant_id);

  const tokens = await requestTokens(
    grant.tenant_id,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(origin),
      code_verifier: verifier,
      scope: `${scope} offline_access`,
    },
    resource,
  );
  await saveAccessToken(userId, resource, tokens);
  await saveRotatedRefreshToken(userId, tokens.refresh_token);
}

/**
 * Redeems the shared refresh token for one resource. Throws
 * MicrosoftConsentRequiredError when that resource has not been consented yet,
 * which is the signal to send the user through buildIncrementalAuthUrl.
 */
export async function ensureResourceToken(
  userId: string,
  resource: MicrosoftResource,
): Promise<string> {
  const grant = await loadGrant(userId);
  if (!grant) throw new MicrosoftNotConnectedError();
  const scope = await resourceScope(resource, grant.tenant_id);

  const tokens = await requestTokens(
    grant.tenant_id,
    {
      grant_type: "refresh_token",
      refresh_token: grant.refresh_token,
      scope: `${scope} offline_access`,
    },
    resource,
  );
  await saveAccessToken(userId, resource, tokens);
  await saveRotatedRefreshToken(userId, tokens.refresh_token);
  return tokens.access_token;
}

/**
 * Whether this resource has ever been consented, regardless of whether the
 * cached token is still fresh. The connect flow uses this to know which
 * resources it still has to walk the user through.
 */
export async function hasResourceToken(
  userId: string,
  resource: MicrosoftResource,
): Promise<boolean> {
  const rows = await adminSql<{ present: boolean }>(
    `SELECT true AS present FROM public.microsoft_access_tokens
     WHERE user_id = $1 AND resource = $2`,
    [userId, resource],
  );
  return rows[0]?.present === true;
}

/**
 * A usable access token for one resource, refreshing when it is close to
 * expiry. Mirrors getValidAccessToken in google-oauth.ts, including dropping a
 * dead grant so the next connect asks for consent again.
 */
export async function getResourceToken(
  userId: string,
  resource: MicrosoftResource,
): Promise<string> {
  const rows = await adminSql<{ access_token: string; expired: boolean }>(
    `SELECT access_token, (expires_at < now() + interval '60 seconds') AS expired
     FROM public.microsoft_access_tokens WHERE user_id = $1 AND resource = $2`,
    [userId, resource],
  );
  const row = rows[0];
  if (row && !row.expired) return row.access_token;

  try {
    return await ensureResourceToken(userId, resource);
  } catch (error) {
    if (error instanceof MicrosoftNotConnectedError) {
      console.error("Microsoft token refresh failed; clearing the grant:", error);
      await adminSql(
        "DELETE FROM public.microsoft_oauth_tokens WHERE user_id = $1",
        [userId],
      );
      await adminSql(
        "DELETE FROM public.microsoft_access_tokens WHERE user_id = $1",
        [userId],
      );
    }
    throw error;
  }
}

/**
 * Turns Outlook off.
 *
 * Entra has no revocation endpoint equivalent to Google's, and the only way to
 * kill the grant server-side would be a Microsoft Graph call — which this
 * integration deliberately does not make. Dropping our copy of the tokens is
 * therefore the terminal action; the user can revoke the app itself from
 * https://myapplications.microsoft.com.
 */
export async function disconnectMicrosoft(userId: string): Promise<void> {
  await markIntegrationStatus(userId, "outlook", "disconnected");
  await adminSql("DELETE FROM public.microsoft_access_tokens WHERE user_id = $1", [
    userId,
  ]);
  await adminSql("DELETE FROM public.microsoft_oauth_tokens WHERE user_id = $1", [
    userId,
  ]);
}
