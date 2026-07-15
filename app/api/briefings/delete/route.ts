import { deleteDefinition } from "@/lib/server/briefing/store";
import { isUuid } from "@/lib/server/gmail-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/** Deletes a custom briefing with its runs and results (never the default). */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: { briefingId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const briefingId = body.briefingId ?? "";
  if (!isUuid(briefingId)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const deleted = await deleteDefinition(user.id, briefingId);
    if (!deleted) {
      return Response.json(
        { error: "This briefing cannot be deleted." },
        { status: 400 },
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Briefings: delete failed:", error);
    return Response.json(
      { error: "Could not delete the briefing. Please retry." },
      { status: 500 },
    );
  }
}
