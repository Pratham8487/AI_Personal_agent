import { checkInternalSecret } from "@/lib/server/briefing/internal-auth";
import {
  AlreadyDoneError,
  runBriefing,
  RunGoneError,
} from "@/lib/server/briefing/service";
import { isUuid } from "@/lib/server/gmail-oauth";

/**
 * Internal endpoint executing one claimed briefing run (called by the
 * Trigger.dev briefing-generate task). Idempotent per run id: an already
 * succeeded run returns 409, a vanished/stale one 410 — the task skips both;
 * transient failures return 5xx so the task retries.
 * Auth: x-internal-secret header. Body: { runId }.
 */
export async function POST(request: Request) {
  const denied = checkInternalSecret(request);
  if (denied) return denied;

  let body: { runId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const runId = body.runId ?? "";
  if (!isUuid(runId)) {
    return Response.json({ error: "Invalid run id." }, { status: 400 });
  }

  try {
    const resultId = await runBriefing(runId);
    return Response.json({ resultId });
  } catch (error) {
    if (error instanceof AlreadyDoneError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof RunGoneError) {
      return Response.json({ error: error.message }, { status: 410 });
    }
    console.error("Briefings: run failed:", error);
    return Response.json(
      { error: "Briefing generation failed." },
      { status: 500 },
    );
  }
}
