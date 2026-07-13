import { getOverview } from "@/lib/server/briefing/service";
import { isUuid } from "@/lib/server/gmail-oauth";

/** Everything the Briefing hub needs in one call. Body: { userId }. */
export async function POST(request: Request) {
  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = body.userId ?? "";
  if (!isUuid(userId)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    return Response.json(await getOverview(userId));
  } catch (error) {
    console.error("Briefings: overview failed:", error);
    return Response.json(
      { error: "Could not load your briefings. Please retry." },
      { status: 500 },
    );
  }
}
