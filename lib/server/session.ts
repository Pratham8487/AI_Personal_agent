import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { adminSql, pool } from "./db";

export const ACCESS_COOKIE = "aster_access";
export const REFRESH_COOKIE = "aster_refresh";

const ACCESS_TTL_MS = 30 * 60 * 1000; // 30 minutes, never extended
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding via rotation
const LAST_USED_WRITE_INTERVAL_MS = 60 * 1000; // throttle last_used_at writes
const REFRESH_REUSE_GRACE_MS = 30 * 1000; // multi-tab rotation race window
const GC_RETENTION = "35 days"; // > refresh lifetime, keeps revoked rows for theft detection

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  phone: string | null;
  providers: string[];
  emailVerified: boolean;
  contactVerified: boolean;
  preferredLanguage: string;
  tourCompleted: boolean;
  active: boolean;
};

export type SessionMeta = { deviceInfo: string | null; ipAddress: string | null };

export type TokenPair = {
  accessToken: string; // raw "<prefix>.<secret>" — never stored
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
};

/** Raw token = "<16 hex prefix>.<base64url secret>"; only sha256(raw) is stored. */
function mintToken(): { raw: string; prefix: string; hash: string } {
  const prefix = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const raw = `${prefix}.${secret}`;
  return { raw, prefix, hash: sha256(raw) };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseToken(raw: string): { prefix: string; hash: string } | null {
  if (!/^[0-9a-f]{16}\.[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  return { prefix: raw.slice(0, 16), hash: sha256(raw) };
}

function hashesMatch(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Device/IP metadata from the current request (route handlers only). */
export async function getRequestMeta(): Promise<SessionMeta> {
  const h = await headers();
  const deviceInfo = h.get("user-agent")?.slice(0, 512) ?? null;
  const ipAddress =
    (h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip"))?.slice(0, 64) ??
    null;
  return { deviceInfo, ipAddress };
}

/** Creates a fresh access+refresh pair (new rotation family). */
export async function createSessionTokens(
  userId: string,
  meta: SessionMeta
): Promise<TokenPair> {
  const access = mintToken();
  const refresh = mintToken();
  const accessExpiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO public.user_access_tokens
         (user_id, token_prefix, token_hash, expires_at, device_info, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, access.prefix, access.hash, accessExpiresAt.toISOString(), meta.deviceInfo, meta.ipAddress]
    );
    await client.query(
      `INSERT INTO public.user_refresh_tokens
         (user_id, access_token_id, family_id, token_prefix, token_hash, expires_at)
       VALUES ($1, $2, gen_random_uuid(), $3, $4, $5)`,
      [userId, inserted.rows[0].id, refresh.prefix, refresh.hash, refreshExpiresAt.toISOString()]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // Opportunistic GC at sign-in frequency. Access-token deletes cascade their
  // refresh rows; live pairs are never touched (refresh expiry < retention).
  await adminSql(
    `DELETE FROM public.user_access_tokens WHERE created_at < now() - interval '${GC_RETENTION}'`
  );
  await adminSql(
    `DELETE FROM public.user_refresh_tokens WHERE expires_at < now() - interval '${GC_RETENTION}'`
  );

  return {
    accessToken: access.raw,
    accessExpiresAt,
    refreshToken: refresh.raw,
    refreshExpiresAt,
  };
}

export async function setAuthCookies(pair: TokenPair): Promise<void> {
  const cookieStore = await cookies();
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    // Both cookies live until refresh expiry; the DB decides actual validity.
    expires: pair.refreshExpiresAt,
  };
  cookieStore.set(ACCESS_COOKIE, pair.accessToken, { ...base, path: "/" });
  // Path-scoped: the long-lived credential only rides along to auth endpoints.
  cookieStore.set(REFRESH_COOKIE, pair.refreshToken, { ...base, path: "/api/auth" });
}

export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  // Deletion must match the path the cookie was set with.
  cookieStore.set(REFRESH_COOKIE, "", { path: "/api/auth", maxAge: 0 });
}

type UserRow = {
  token_id: string;
  token_hash: string;
  last_used_at: string | null;
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  providers: string[];
  email_verified: boolean;
  contact_verified: boolean;
  preferred_language: string;
  tour_completed: boolean;
  active: boolean;
};

function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    providers: row.providers ?? [],
    emailVerified: row.email_verified,
    contactVerified: row.contact_verified,
    preferredLanguage: row.preferred_language,
    tourCompleted: row.tour_completed,
    active: row.active,
  };
}

/**
 * Resolves the signed-in user from the access-token cookie, or null.
 * Read-only (never sets cookies), so it is safe anywhere on the server.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!raw) return null;
  const parsed = parseToken(raw);
  if (!parsed) return null;

  const candidates = await adminSql<UserRow>(
    `SELECT t.id AS token_id, t.token_hash, t.last_used_at,
            u.id, u.email, u.name, u.avatar_url, u.phone, u.providers,
            u.email_verified, u.contact_verified, u.preferred_language,
            u.tour_completed, u.active
     FROM public.user_access_tokens t
     JOIN public.users u ON u.id = t.user_id
     WHERE t.token_prefix = $1 AND t.revoked = false AND t.expires_at > now()
       AND u.active`,
    [parsed.prefix]
  );
  const row = candidates.find((c) => hashesMatch(c.token_hash, parsed.hash));
  if (!row) return null;

  const seenAgo = row.last_used_at ? Date.now() - Date.parse(row.last_used_at) : Infinity;
  if (seenAgo > LAST_USED_WRITE_INTERVAL_MS) {
    await adminSql(
      `UPDATE public.user_access_tokens SET last_used_at = now() WHERE id = $1`,
      [row.token_id]
    );
  }
  return toSessionUser(row);
}

type RefreshRow = {
  id: string;
  user_id: string;
  access_token_id: string;
  family_id: string;
  token_hash: string;
  expires_at: string;
  last_used_at: string | null;
  revoked: boolean;
};

/**
 * Rotates the refresh token: revokes the presented one (and its access token)
 * and issues a fresh pair in the same family. Returns null on any failure.
 * Reuse of an already-revoked token outside the grace window is treated as
 * theft: the whole family is revoked.
 */
export async function refreshSession(
  rawRefreshToken: string,
  meta: SessionMeta
): Promise<TokenPair | null> {
  const parsed = parseToken(rawRefreshToken);
  if (!parsed) return null;

  const candidates = await adminSql<RefreshRow>(
    `SELECT id, user_id, access_token_id, family_id, token_hash, expires_at,
            last_used_at, revoked
     FROM public.user_refresh_tokens WHERE token_prefix = $1`,
    [parsed.prefix]
  );
  const row = candidates.find((c) => hashesMatch(c.token_hash, parsed.hash));
  if (!row) return null;

  if (row.revoked) {
    const usedAgo = row.last_used_at ? Date.now() - Date.parse(row.last_used_at) : Infinity;
    if (usedAgo > REFRESH_REUSE_GRACE_MS) {
      // Theft detected: another party already rotated this token. Kill the family.
      console.warn(
        `Refresh-token reuse detected (prefix ${parsed.prefix.slice(0, 8)}…, user ${row.user_id}) — revoking family`
      );
      await adminSql(
        `UPDATE public.user_access_tokens SET revoked = true
         WHERE id IN (SELECT access_token_id FROM public.user_refresh_tokens WHERE family_id = $1)`,
        [row.family_id]
      );
      await adminSql(
        `UPDATE public.user_refresh_tokens SET revoked = true WHERE family_id = $1`,
        [row.family_id]
      );
    }
    // Within grace: benign multi-tab race — the client retry carries the
    // winner's rotated cookies.
    return null;
  }
  if (Date.parse(row.expires_at) <= Date.now()) return null;

  const access = mintToken();
  const refresh = mintToken();
  const accessExpiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Conditional revoke doubles as the concurrency lock: 0 rows means a
    // parallel request won the rotation race.
    const claimed = await client.query(
      `UPDATE public.user_refresh_tokens
       SET revoked = true, last_used_at = now()
       WHERE id = $1 AND revoked = false RETURNING id`,
      [row.id]
    );
    if (claimed.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `UPDATE public.user_access_tokens SET revoked = true WHERE id = $1`,
      [row.access_token_id]
    );
    const inserted = await client.query(
      `INSERT INTO public.user_access_tokens
         (user_id, token_prefix, token_hash, expires_at, device_info, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [row.user_id, access.prefix, access.hash, accessExpiresAt.toISOString(), meta.deviceInfo, meta.ipAddress]
    );
    await client.query(
      `INSERT INTO public.user_refresh_tokens
         (user_id, access_token_id, family_id, token_prefix, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.user_id, inserted.rows[0].id, row.family_id, refresh.prefix, refresh.hash, refreshExpiresAt.toISOString()]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    accessToken: access.raw,
    accessExpiresAt,
    refreshToken: refresh.raw,
    refreshExpiresAt,
  };
}

/** Revokes this device's token pair (reads the current cookies). */
export async function revokeSession(): Promise<void> {
  const cookieStore = await cookies();

  const rawRefresh = cookieStore.get(REFRESH_COOKIE)?.value;
  const parsedRefresh = rawRefresh ? parseToken(rawRefresh) : null;
  if (parsedRefresh) {
    const candidates = await adminSql<{ id: string; token_hash: string; access_token_id: string }>(
      `SELECT id, token_hash, access_token_id FROM public.user_refresh_tokens
       WHERE token_prefix = $1`,
      [parsedRefresh.prefix]
    );
    const row = candidates.find((c) => hashesMatch(c.token_hash, parsedRefresh.hash));
    if (row) {
      await adminSql(`UPDATE public.user_refresh_tokens SET revoked = true WHERE id = $1`, [row.id]);
      await adminSql(`UPDATE public.user_access_tokens SET revoked = true WHERE id = $1`, [row.access_token_id]);
    }
  }

  // Belt-and-suspenders in case the cookies are mismatched.
  const rawAccess = cookieStore.get(ACCESS_COOKIE)?.value;
  const parsedAccess = rawAccess ? parseToken(rawAccess) : null;
  if (parsedAccess) {
    const candidates = await adminSql<{ id: string; token_hash: string }>(
      `SELECT id, token_hash FROM public.user_access_tokens WHERE token_prefix = $1`,
      [parsedAccess.prefix]
    );
    const row = candidates.find((c) => hashesMatch(c.token_hash, parsedAccess.hash));
    if (row) {
      await adminSql(`UPDATE public.user_access_tokens SET revoked = true WHERE id = $1`, [row.id]);
    }
  }
}

/** Revokes every token on every device (e.g. after a password reset). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await adminSql(
    `UPDATE public.user_access_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
    [userId]
  );
  await adminSql(
    `UPDATE public.user_refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
    [userId]
  );
}

export function unauthorized(): Response {
  return Response.json({ error: "Not signed in." }, { status: 401 });
}
