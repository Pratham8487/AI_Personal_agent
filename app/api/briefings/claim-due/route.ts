import { checkInternalSecret } from "@/lib/server/briefing/internal-auth";
import {
  claimDueRuns,
  reconcileDefaultBriefings,
  staleQueuedRuns,
} from "@/lib/server/briefing/schedule";

/**
 * Internal endpoint for the Trigger.dev 15-minute cron: reconciles the
 * per-user default daily brief, atomically claims every briefing due in the
 * window, and re-returns stale queued runs whose enqueue was lost.
 * Auth: x-internal-secret header. Body: { windowMinutes? }.
 */
export async function POST(request: Request) {
  const denied = checkInternalSecret(request);
  if (denied) return denied;

  let body: { windowMinutes?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const windowMinutes = Math.min(
    60,
    Math.max(1, Math.trunc(body.windowMinutes ?? 15) || 15),
  );

  try {
    await reconcileDefaultBriefings();
    const [claimed, stale] = [await claimDueRuns(windowMinutes), await staleQueuedRuns()];
    const seen = new Set(claimed.map((r) => r.run_id));
    const runs = [...claimed, ...stale.filter((r) => !seen.has(r.run_id))].map(
      (r) => ({
        runId: r.run_id,
        briefingId: r.briefing_id,
        userId: r.user_id,
        scheduledFor: r.scheduled_for,
      }),
    );
    return Response.json({ runs });
  } catch (error) {
    console.error("Briefings: claim-due failed:", error);
    return Response.json(
      { error: "Could not claim due briefings." },
      { status: 500 },
    );
  }
}
