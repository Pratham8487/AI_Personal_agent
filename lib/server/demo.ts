import { adminSql } from "./db";
import { envInt, type RefreshPolicy } from "./dashboard/refresh-limit";
import type { SessionUser } from "./session";

/**
 * "Try Demo" temporary users. A demo user is an ordinary users row (provider
 * 'demo') with a normal session, so it inherits every page, connector and
 * per-user limit for free — this module only adds the throwaway lifecycle:
 *
 *   create → renew (heartbeat) → expireSoon (tab close beacon) → reap (delete)
 *
 * Nothing here runs for real accounts, so existing auth is untouched. The reap
 * is idempotent and self-pruning: any demo endpoint (and the 15-min retention
 * cron) calls reapExpiredDemoUsers() opportunistically.
 */

/**
 * Heartbeat renewal window: each beat pushes expiry this far out. Kept well
 * above the client heartbeat interval so a briefly backgrounded tab (whose
 * timers the browser throttles) is not reaped before its next beat. Prompt
 * deletion on a real tab-close comes from the beacon's short grace below.
 */
const TTL_SECONDS = envInt("DEMO_SESSION_TTL_SECONDS", 600);
/** Grace after a tab-close beacon; long enough for a *refresh* to renew first. */
const CLOSE_GRACE_SECONDS = envInt("DEMO_CLOSE_GRACE_SECONDS", 10);

/** AI-agent message cap for demo users. Regular users are never gated here. */
export const DEMO_AGENT_FEATURE = "agent_demo";
export const DEMO_AGENT_POLICY: RefreshPolicy = {
  limit: envInt("DEMO_AGENT_MESSAGE_LIMIT", 3),
  // Demo sessions live minutes, so a 24h window is effectively "per session".
  windowMs: 24 * 60 * 60_000,
};

/** RETURNING column list shared by the create query and the mapper below. */
const USER_COLUMNS = `id, email, name, avatar_url, phone, providers,
  email_verified, contact_verified, tour_completed, active, is_demo`;

type DemoUserRow = {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  providers: string[];
  email_verified: boolean;
  contact_verified: boolean;
  tour_completed: boolean;
  active: boolean;
  is_demo: boolean;
};

function toSessionUser(row: DemoUserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    providers: row.providers ?? [],
    emailVerified: row.email_verified,
    contactVerified: row.contact_verified,
    tourCompleted: row.tour_completed,
    active: row.active,
    isDemo: row.is_demo,
  };
}

/** Trims to a friendly display name; never empty, never abusively long. */
function cleanName(name: unknown): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed ? trimmed.slice(0, 80) : "Guest";
}

/**
 * Creates a throwaway demo account. It is pre-onboarded (tour + contact marked
 * done) so it drops straight onto the dashboard, and carries no email/password.
 */
export async function createDemoUser(name: unknown): Promise<SessionUser> {
  const rows = await adminSql<DemoUserRow>(
    `INSERT INTO public.users
       (name, providers, is_demo, demo_expires_at, email_verified,
        contact_verified, tour_completed, active, verification_method,
        last_login_at)
     VALUES ($1, ARRAY['demo'], true, now() + make_interval(secs => $2::int),
             false, true, true, true, 'demo', now())
     RETURNING ${USER_COLUMNS}`,
    [cleanName(name), TTL_SECONDS],
  );
  return toSessionUser(rows[0]);
}

/** Heartbeat: pushes the demo session's expiry out by the full TTL. */
export async function renewDemoUser(userId: string): Promise<void> {
  await adminSql(
    `UPDATE public.users
     SET demo_expires_at = now() + make_interval(secs => $2::int)
     WHERE id = $1 AND is_demo`,
    [userId, TTL_SECONDS],
  );
}

/**
 * Tab-close beacon: shortens the session to a brief grace window. If this was a
 * real close the reaper removes it after the grace; if it was a *refresh*, the
 * reloaded tab's first heartbeat renews the TTL before the grace elapses.
 */
export async function expireDemoUserSoon(userId: string): Promise<void> {
  await adminSql(
    `UPDATE public.users
     SET demo_expires_at = now() + make_interval(secs => $2::int)
     WHERE id = $1 AND is_demo`,
    [userId, CLOSE_GRACE_SECONDS],
  );
}

/** Best-effort WhatsApp socket teardown for users about to be deleted. */
async function teardownWhatsapp(ids: string[]): Promise<void> {
  try {
    const { getOpenSocket, disconnectUser } = await import("./whatsapp-manager");
    for (const id of ids) {
      // Only touch the heavy subsystem for users that actually have a socket.
      if (getOpenSocket(id)) await disconnectUser(id).catch(() => {});
    }
  } catch {
    // WhatsApp unavailable — the user delete below still clears every DB row.
  }
}

/**
 * Deletes every demo user whose grace/TTL has lapsed, plus all of their data.
 * FK-cascade tables go with the users row; the code-owned tables carry no FK
 * (see db/migrations/001_init.sql) so they are cleared explicitly first.
 * A no-op when nothing has expired.
 */
export async function reapExpiredDemoUsers(): Promise<void> {
  const expired = await adminSql<{ id: string }>(
    `SELECT id FROM public.users
     WHERE is_demo AND demo_expires_at IS NOT NULL AND demo_expires_at < now()`,
  );
  const ids = expired.map((r) => r.id);
  if (ids.length === 0) return;

  await teardownWhatsapp(ids);

  // No-FK, code-owned tables — must be deleted by hand.
  for (const table of [
    "agent_messages",
    "agent_conversations",
    "briefing_results",
    "briefing_runs",
    "briefings",
    "ai_refresh_logs",
  ]) {
    await adminSql(`DELETE FROM ${table} WHERE user_id = ANY($1::uuid[])`, [ids]);
  }

  // Everything else (tokens, integrations, settings, oauth, whatsapp_*,
  // dashboard_briefs, …) cascades from the users row.
  await adminSql(`DELETE FROM public.users WHERE id = ANY($1::uuid[])`, [ids]);
}
