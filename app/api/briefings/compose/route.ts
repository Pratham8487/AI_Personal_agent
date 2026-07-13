import { AiNotConfiguredError, aiConfigured } from "@/lib/server/brief-ai";
import { composeDraft, type ComposeChannel } from "@/lib/server/briefing/ai";
import { getResult } from "@/lib/server/briefing/store";
import { isUuid } from "@/lib/server/gmail-oauth";

/**
 * Drafts an email/message from a briefing item's context.
 * Body: { userId, channel, item: { title, description, source, timestamp? },
 *         resultId?, instruction? }.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!isUuid(userId)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }
  const channel = body.channel;
  if (channel !== "gmail" && channel !== "whatsapp") {
    return Response.json({ error: "Invalid channel." }, { status: 400 });
  }
  const rawItem = body.item;
  if (!rawItem || typeof rawItem !== "object") {
    return Response.json({ error: "An item is required." }, { status: 400 });
  }
  const { title, description, source, timestamp } = rawItem as Record<
    string,
    unknown
  >;
  const item = {
    title: typeof title === "string" ? title.slice(0, 200) : "",
    description: typeof description === "string" ? description.slice(0, 500) : "",
    source: typeof source === "string" ? source.slice(0, 40) : "",
    ...(typeof timestamp === "string" ? { timestamp: timestamp.slice(0, 40) } : {}),
  };
  if (!item.title) {
    return Response.json({ error: "An item title is required." }, { status: 400 });
  }
  if (!aiConfigured()) {
    return Response.json(
      { error: new AiNotConfiguredError().message, code: "not_configured" },
      { status: 503 },
    );
  }

  try {
    // Ground the draft on the stored briefing summary when one is referenced.
    let briefingSummary: string | undefined;
    const resultId = body.resultId;
    if (typeof resultId === "string" && isUuid(resultId)) {
      const result = await getResult(userId, resultId);
      briefingSummary = result?.topSummary;
    }
    const draft = await composeDraft(channel as ComposeChannel, {
      item,
      ...(briefingSummary ? { briefingSummary } : {}),
      ...(typeof body.instruction === "string" && body.instruction.trim()
        ? { instruction: body.instruction }
        : {}),
    });
    return Response.json({ draft });
  } catch (error) {
    console.error("Briefings: compose failed:", error);
    return Response.json(
      { error: "Could not draft the message. Please write it manually." },
      { status: 502 },
    );
  }
}
