import { deleteDefinition } from "@/lib/server/briefing/store";
import { isUuid } from "@/lib/server/gmail-oauth";

/** Deletes a custom briefing with its runs and results (never the default). */
export async function POST(request: Request) {
  let body: { userId?: string; briefingId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = body.userId ?? "";
  const briefingId = body.briefingId ?? "";
  if (!isUuid(userId) || !isUuid(briefingId)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const deleted = await deleteDefinition(userId, briefingId);
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
