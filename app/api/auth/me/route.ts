import { getSessionUser } from "@/lib/server/session";

export async function GET() {
  try {
    const user = await getSessionUser();
    return Response.json({ user });
  } catch (error) {
    console.error("me route failed:", error);
    return Response.json({ user: null });
  }
}
