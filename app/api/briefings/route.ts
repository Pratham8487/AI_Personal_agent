import {
  computeNextRun,
  InvalidScheduleError,
} from "@/lib/server/briefing/schedule";
import { BriefingCapError, createDefinition } from "@/lib/server/briefing/store";
import { parseDefinitionInput } from "@/lib/server/briefing/validate";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/** Creates a custom briefing. Body: { ...BriefingDefinitionInput }. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = parseDefinitionInput(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { nextRunAt, timezone } = await computeNextRun(parsed.input);
    const briefing = await createDefinition(
      user.id,
      { ...parsed.input, timezone },
      nextRunAt,
    );
    return Response.json({ briefing }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidScheduleError || error instanceof BriefingCapError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Briefings: create failed:", error);
    return Response.json(
      { error: "Could not create the briefing. Please retry." },
      { status: 500 },
    );
  }
}
