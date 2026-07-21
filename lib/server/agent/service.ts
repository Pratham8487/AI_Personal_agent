import type { AgentStreamEvent } from "@/lib/agent-protocol";
import { aiConnection, chatJson } from "@/lib/server/brief-ai";
import { toolTitle } from "@/lib/tool-title";
import {
  attachSuggestions,
  conversationExists,
  createConversation,
  getActiveConversationId,
  listRecentMessages,
  saveMessage,
  touchConversation,
} from "./store";
import {
  buildAgentTools,
  connectedProviders,
  executeAgentTool,
  type AgentTool,
} from "./tools";

/**
 * Streaming chat agent over the OpenAI-compatible Chat Completions API.
 * Runs a bounded tool loop over the user's connected MCP catalogs and reports
 * progress as AgentStreamEvents, which the route serializes as NDJSON.
 */

const MAX_TOOL_ROUNDS = 5;
/** Turns of prior context sent to the model (the most recent ones). */
const HISTORY_MESSAGES = 24;
const HISTORY_CHARS = 4_000;
const TOOL_RESULT_CHARS = 8_000;
const COMPLETION_TIMEOUT_MS = 60_000;

type WireToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type WireMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: WireToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type CompletionResult = {
  content: string;
  toolCalls: WireToolCall[];
};

function buildSystemPrompt(providers: string[], liveApps: string[]): string {
  const connected = providers.length ? providers.join(", ") : "none";
  const hasTools = liveApps.length > 0;
  return `You are Aster, the user's personal AI assistant. You answer questions about their day and their connected apps.
Current time: ${new Date().toISOString()}.
Connected apps: ${connected}. Live data tools are available for: ${hasTools ? liveApps.join(", ") : "none"}.
Rules:
- ${
    hasTools
      ? "For any question about the user's real emails, messages, meetings, or activity, call the tools to fetch live data BEFORE answering. Prefer small counts, and batch independent lookups into a single round."
      : "No live data tools are available. Answer generally and suggest connecting Gmail, Google Calendar or WhatsApp on the Integrations page for live answers."
  }
- NEVER invent senders, messages, counts, times, or content. If a tool fails or returns nothing, say so plainly.
- Ask before sending any email or message, or creating, changing or deleting any calendar event, unless the user explicitly asked for it.
- Format answers in GitHub-flavored markdown: short headings, bullet lists, tables for structured comparisons, **bold** for key facts, fenced code blocks only for code.
- Refer to apps by their plain names (Gmail, Google Calendar, WhatsApp, Slack...).
- Be concise and action-oriented.`;
}

/** Parses one SSE stream from /chat/completions, emitting content deltas. */
async function readCompletionStream(
  res: Response,
  onDelta: (text: string) => void,
): Promise<CompletionResult> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("AI response had no body.");
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const partials: { id: string; name: string; args: string }[] = [];

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let parsed: {
      choices?: {
        delta?: {
          content?: string | null;
          tool_calls?: {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
      }[];
    };
    try {
      parsed = JSON.parse(payload);
    } catch {
      return; // ignore malformed keep-alive chunks
    }
    const delta = parsed.choices?.[0]?.delta;
    if (!delta) return;
    if (typeof delta.content === "string" && delta.content) {
      content += delta.content;
      onDelta(delta.content);
    }
    // Providers stream tool calls as fragments keyed by index; name and
    // arguments both arrive split across chunks and must be concatenated.
    for (const call of delta.tool_calls ?? []) {
      const index = call.index ?? 0;
      partials[index] ??= { id: "", name: "", args: "" };
      if (call.id) partials[index].id = call.id;
      if (call.function?.name) partials[index].name += call.function.name;
      if (call.function?.arguments) {
        partials[index].args += call.function.arguments;
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }
  handleLine(buffer);

  const toolCalls: WireToolCall[] = partials
    .filter((call) => call && call.name)
    .map((call, index) => ({
      id: call.id || `call_${index}`,
      type: "function",
      function: { name: call.name, arguments: call.args || "{}" },
    }));
  return { content, toolCalls };
}

/** Releases an unread error-response body so the socket is not held open. */
async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // already closed
  }
}

/**
 * One completion round. Tries streaming; providers that reject streaming
 * (400) get one non-streaming retry whose text is emitted as a single delta.
 */
async function completeOnce(
  messages: WireMessage[],
  tools: AgentTool[],
  allowTools: boolean,
  onDelta: (text: string) => void,
  signal: AbortSignal | undefined,
): Promise<CompletionResult> {
  const { apiKey, model, baseUrl } = aiConnection();
  const body = {
    model,
    messages,
    temperature: 0.4,
    max_tokens: 1_000,
    ...(allowTools && tools.length
      ? { tools: tools.map((tool) => tool.definition) }
      : {}),
  };
  const request = (stream: boolean) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, stream }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(COMPLETION_TIMEOUT_MS)])
        : AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
    });

  let res = await request(true);
  // Provider 5xx errors are usually transient; retry once before failing.
  if (res.status >= 500) {
    await discard(res);
    res = await request(true);
  }
  if (res.ok) return readCompletionStream(res, onDelta);

  if (res.status === 400) {
    await discard(res);
    res = await request(false);
    if (res.ok) {
      const parsed = (await res.json()) as {
        choices?: {
          message?: { content?: string | null; tool_calls?: WireToolCall[] };
        }[];
      };
      const message = parsed.choices?.[0]?.message;
      const content =
        typeof message?.content === "string" ? message.content : "";
      if (content) onDelta(content);
      return { content, toolCalls: message?.tool_calls ?? [] };
    }
  }
  const status = res.status;
  await discard(res);
  throw new Error(`AI request failed (${status}).`);
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Quick-reply prompts for the just-finished exchange; empty on any failure. */
async function generateSuggestions(
  question: string,
  answer: string,
): Promise<string[]> {
  try {
    const parsed = await chatJson(
      `You suggest follow-up prompts for a personal-assistant chat about the user's connected apps (Gmail, WhatsApp).
Given the last question and answer, reply with JSON only: {"suggestions":[<string>,<string>,<string>]}.
Each suggestion: a natural next prompt the user might tap, under 55 characters, no numbering, no quotes inside.`,
      { question: question.slice(0, 1_000), answer: answer.slice(0, 2_000) },
      { maxTokens: 150, timeoutMs: 8_000 },
    );
    const items = (parsed as { suggestions?: unknown })?.suggestions;
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    return items
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (item.length > 80 ? `${item.slice(0, 79)}…` : item))
      // Duplicate prompts would collide as React keys in the chip row.
      .filter((item) => !seen.has(item) && seen.add(item))
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function runAgentChat(options: {
  userId: string;
  conversationId: string | null;
  message: string;
  emit: (event: AgentStreamEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { userId, message, emit, signal } = options;

  let conversationId = options.conversationId;
  if (!conversationId || !(await conversationExists(userId, conversationId))) {
    conversationId =
      (await getActiveConversationId(userId)) ??
      (await createConversation(userId));
  }
  emit({ type: "meta", conversationId });

  const history = await listRecentMessages(conversationId, HISTORY_MESSAGES);
  await saveMessage(conversationId, userId, "user", message);

  const providers = await connectedProviders(userId);
  const tools = await buildAgentTools(userId, providers);
  const liveApps = [...new Set(tools.map((tool) => tool.provider))];

  const messages: WireMessage[] = [
    { role: "system", content: buildSystemPrompt(providers, liveApps) },
    ...history.map(
      (row): WireMessage => ({
        role: row.role,
        content: row.content.slice(0, HISTORY_CHARS),
      }),
    ),
    { role: "user", content: message },
  ];

  const toolsByName = new Map(
    tools.map((tool) => [tool.definition.function.name, tool]),
  );
  const appsUsed = new Set<string>();
  let fullText = "";
  let roundStart = 0;

  const onDelta = (text: string) => {
    // Text emitted after a tool round starts a new block; the separator is
    // emitted too so the saved text matches what the client rendered.
    if (fullText && fullText.length === roundStart) {
      fullText += "\n\n";
      emit({ type: "delta", text: "\n\n" });
    }
    fullText += text;
    emit({ type: "delta", text });
  };

  let aborted = false;
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      roundStart = fullText.length;
      // The final round runs without tools so the model must produce prose.
      const allowTools = round < MAX_TOOL_ROUNDS - 1;
      const result = await completeOnce(
        messages,
        tools,
        allowTools,
        onDelta,
        signal,
      );

      if (!result.toolCalls.length) break;

      messages.push({
        role: "assistant",
        content: result.content || null,
        tool_calls: result.toolCalls,
      });

      // Announce every call in the round up front, then run them together:
      // independent lookups (inbox + chats) no longer wait on each other,
      // and the UI can show the whole checklist at once.
      const planned = result.toolCalls.map((call) => ({
        call,
        tool: toolsByName.get(call.function.name),
      }));
      for (const { call, tool } of planned) {
        if (!tool) continue;
        emit({
          type: "tool_start",
          id: call.id,
          app: tool.provider,
          label: toolTitle(tool.toolName),
        });
      }

      const outcomes = await Promise.all(
        planned.map(async ({ call, tool }) => {
          if (!tool) {
            return {
              call,
              text: `Unknown tool: ${call.function.name}`,
              ok: false,
            };
          }
          const outcome = await executeAgentTool(
            userId,
            tool,
            parseToolArgs(call.function.arguments),
          );
          if (outcome.ok) appsUsed.add(tool.provider);
          return { call, text: outcome.text, ok: outcome.ok };
        }),
      );

      for (const outcome of outcomes) {
        emit({ type: "tool_end", id: outcome.call.id, ok: outcome.ok });
        messages.push({
          role: "tool",
          tool_call_id: outcome.call.id,
          content: outcome.text.slice(0, TOOL_RESULT_CHARS),
        });
      }
    }
  } catch (error) {
    // A stop from the client is not a failure: keep whatever was generated
    // and fall through so the partial answer is still persisted.
    const isAbort =
      signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError");
    if (!isAbort) throw error;
    aborted = true;
  }

  if (!fullText.trim()) {
    if (aborted) {
      emit({ type: "done", messageId: null, apps: [] });
      return;
    }
    fullText = "I couldn't put together an answer this time. Please try again.";
    emit({ type: "delta", text: fullText });
  }

  const apps = [...appsUsed];
  const messageId = await saveMessage(
    conversationId,
    userId,
    "assistant",
    fullText,
    apps,
  );
  await touchConversation(conversationId);

  // Answer is complete — stop the "generating" UI before spending another
  // model round-trip on quick replies.
  emit({ type: "done", messageId, apps });

  if (aborted) return;
  const suggestions = await generateSuggestions(message, fullText);
  if (suggestions.length) {
    await attachSuggestions(messageId, suggestions);
    emit({ type: "suggestions", items: suggestions });
  }
}
