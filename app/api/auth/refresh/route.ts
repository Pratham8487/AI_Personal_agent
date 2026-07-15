import { cookies } from "next/headers";
import { assertSameOrigin } from "@/lib/server/request-origin";
import {
  clearAuthCookies,
  getRequestMeta,
  REFRESH_COOKIE,
  refreshSession,
  setAuthCookies,
  unauthorized,
} from "@/lib/server/session";

export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  const cookieStore = await cookies();
  const raw = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!raw) return unauthorized();

  try {
    const pair = await refreshSession(raw, await getRequestMeta());
    if (!pair) {
      await clearAuthCookies();
      return unauthorized();
    }
    await setAuthCookies(pair);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("refresh failed:", error);
    return Response.json({ error: "Refresh failed." }, { status: 500 });
  }
}
