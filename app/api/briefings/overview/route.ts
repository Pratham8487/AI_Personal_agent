import { getOverview } from "@/lib/server/briefing/service";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/** Everything the Briefing hub needs in one call. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    return Response.json(await getOverview(user.id));
  } catch (error) {
    console.error("Briefings: overview failed:", error);
    return Response.json(
      { error: "Could not load your briefings. Please retry." },
      { status: 500 },
    );
  }
}
