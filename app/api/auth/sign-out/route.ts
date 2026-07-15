import { assertSameOrigin } from "@/lib/server/request-origin";
import { clearAuthCookies, revokeSession } from "@/lib/server/session";

export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  try {
    await revokeSession();
  } catch (error) {
    console.error("sign-out token revoke failed:", error);
  }
  await clearAuthCookies();
  return Response.json({ success: true });
}
