import {
  computeNextRun,
  InvalidScheduleError,
} from "@/lib/server/briefing/schedule";
import { getDefinition, updateDefinition } from "@/lib/server/briefing/store";
import { parseDefinitionInput } from "@/lib/server/briefing/validate";
import { isUuid } from "@/lib/server/gmail-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/**
 * Updates a briefing. Body: { briefingId, enabled?, ...input }.
 * The default row's name and schedule stay managed by user_settings; only
 * its content fields (apps, categories, priority) and enabled are applied.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const briefingId = typeof body.briefingId === "string" ? body.briefingId : "";
  if (!isUuid(briefingId)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }
  const parsed = parseDefinitionInput(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const existing = await getDefinition(user.id, briefingId);
    if (!existing) {
      return Response.json({ error: "Briefing not found." }, { status: 404 });
    }
    let input = parsed.input;
    let nextRunAt: string | null = null;
    if (!existing.isDefault) {
      const computed = await computeNextRun(parsed.input);
      nextRunAt = computed.nextRunAt;
      input = { ...parsed.input, timezone: computed.timezone };
    }
    const briefing = await updateDefinition(
      user.id,
      briefingId,
      input,
      nextRunAt,
      body.enabled !== false,
    );
    if (!briefing) {
      return Response.json({ error: "Briefing not found." }, { status: 404 });
    }
    return Response.json({ briefing });
  } catch (error) {
    if (error instanceof InvalidScheduleError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Briefings: update failed:", error);
    return Response.json(
      { error: "Could not update the briefing. Please retry." },
      { status: 500 },
    );
  }
}
