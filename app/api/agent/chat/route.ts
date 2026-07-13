import { runAgentChat, type AgentStreamEvent } from "@/lib/server/agent/service";
import { aiConfigured } from "@/lib/server/brief-ai";
import { isUuid } from "@/lib/server/gmail-oauth";

const MAX_MESSAGE_CHARS = 4_000;

/**
 * POST { userId, message, conversationId? } → NDJSON stream of
 * AgentStreamEvent lines (meta, status, delta, suggestions, done, error).
 */
export async function POST(request: Request) {
  let body: {
    userId?: string;
    conversationId?: string | null;
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const userId = body.userId ?? "";
  if (!isUuid(userId)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return Response.json({ error: "Invalid message." }, { status: 400 });
  }
  const conversationId =
    typeof body.conversationId === "string" && isUuid(body.conversationId)
      ? body.conversationId
      : null;
  if (!aiConfigured()) {
    return Response.json(
      { error: "AI model is not configured.", code: "not_configured" },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AgentStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runAgentChat({ userId, conversationId, message, emit });
      } catch (error) {
        console.error("Agent chat failed:", error);
        emit({
          type: "error",
          message: "Something went wrong while answering. Please retry.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
