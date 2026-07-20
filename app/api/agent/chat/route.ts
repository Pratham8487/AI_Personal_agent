import { MAX_MESSAGE_CHARS, type AgentStreamEvent } from "@/lib/agent-protocol";
import { runAgentChat } from "@/lib/server/agent/service";
import { aiConfigured } from "@/lib/server/brief-ai";
import { isUuid } from "@/lib/server/gmail-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/**
 * POST { message, conversationId? } → NDJSON stream of AgentStreamEvent lines.
 *
 * The turn is aborted when the client disconnects or stops generation, which
 * cancels the in-flight model request instead of letting it run to completion
 * against a reader that has gone away.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: { conversationId?: string | null; message?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
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

  const abort = new AbortController();
  // Client closed the connection mid-answer.
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: AgentStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // reader went away
        }
      };

      try {
        await runAgentChat({
          userId: user.id,
          conversationId,
          message,
          emit,
          signal: abort.signal,
        });
      } catch (error) {
        console.error("Agent chat failed:", error);
        emit({
          type: "error",
          message: "Something went wrong while answering. Please retry.",
        });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // already closed by cancel()
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Prevents proxies from buffering the stream into a single chunk.
      "X-Accel-Buffering": "no",
    },
  });
}
