import { expireDemoUserSoon, reapExpiredDemoUsers } from "@/lib/server/demo";
import { assertSameOrigin } from "@/lib/server/request-origin";
import { getSessionUser } from "@/lib/server/session";

/**
 * Tab-close beacon target (navigator.sendBeacon on pagehide). Shortens the
 * caller's demo session to a brief grace window, then sweeps. A refresh renews
 * the TTL again before the grace elapses, so reloads are never deleted; a real
 * close lets the sweep remove the user and all of its data.
 */
export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  try {
    const user = await getSessionUser();
    if (user?.isDemo) await expireDemoUserSoon(user.id);
    void reapExpiredDemoUsers().catch((error) =>
      console.error("demo reap failed:", error),
    );
  } catch (error) {
    console.error("demo close failed:", error);
  }
  return new Response(null, { status: 204 });
}
