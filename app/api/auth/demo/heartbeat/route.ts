import { reapExpiredDemoUsers, renewDemoUser } from "@/lib/server/demo";
import { assertSameOrigin } from "@/lib/server/request-origin";
import { getSessionUser } from "@/lib/server/session";

/**
 * Keep-alive for an open demo tab: renews the caller's own demo TTL (from the
 * session cookie) so a live session is never reaped. No-op for real accounts.
 */
export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  try {
    const user = await getSessionUser();
    if (user?.isDemo) await renewDemoUser(user.id);
    void reapExpiredDemoUsers().catch((error) =>
      console.error("demo reap failed:", error),
    );
  } catch (error) {
    console.error("demo heartbeat failed:", error);
  }
  return new Response(null, { status: 204 });
}
