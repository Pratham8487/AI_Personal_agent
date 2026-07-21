import { disconnectGoogleProvider } from "@/lib/server/google-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/**
 * Turns Google Calendar off. The Google grant is shared with Gmail, so it is
 * only revoked once no Google integration is left connected — see
 * disconnectGoogleProvider.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    await disconnectGoogleProvider(user.id, "google-calendar");
    return Response.json({ success: true });
  } catch (error) {
    console.error("Google Calendar disconnect failed:", error);
    return Response.json(
      { error: "Could not disconnect Google Calendar. Please retry." },
      { status: 500 },
    );
  }
}
