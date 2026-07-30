import { createDemoUser, reapExpiredDemoUsers } from "@/lib/server/demo";
import { assertSameOrigin } from "@/lib/server/request-origin";
import {
  createSessionTokens,
  getRequestMeta,
  setAuthCookies,
} from "@/lib/server/session";

/**
 * POST { name } → creates a throwaway demo user and opens a session for it,
 * reusing the exact same token/cookie machinery as sign-up. Only a name is
 * collected; there is no email, password or verification step.
 */
export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    // Keep the table tidy without blocking the response.
    void reapExpiredDemoUsers().catch((error) =>
      console.error("demo reap failed:", error),
    );

    const user = await createDemoUser(body.name);
    const pair = await createSessionTokens(user.id, await getRequestMeta());
    await setAuthCookies(pair);

    return Response.json({ user });
  } catch (error) {
    console.error("demo sign-in failed:", error);
    return Response.json(
      { error: "Could not start the demo. Please try again." },
      { status: 500 },
    );
  }
}
