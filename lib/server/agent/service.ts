import { aiConnection, chatJson } from "@/lib/server/brief-ai";
import { toolTitle } from "@/lib/tool-title";
import {
  conversationExists,
  createConversation,
  getActiveConversationId,
  listMessages,
  pruneExpired,
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
 * Runs a bounded tool loop (Gmail/WhatsApp MCP tools) and reports progress
 * through NDJSON-able events consumed by app/api/agent/chat/route.ts.
 */

const MAX_TOOL_ROUNDS = 5;
const HISTORY_MESSAGES = 24;
const HISTORY_CHARS = 4_000;
const TOOL_RESULT_CHARS = 8_000;
const COMPLETION_TIMEOUT_MS = 60_000;

export type AgentStreamEvent =
  | { type: "meta"; conversationId: string }
  | { type: "status"; app: string; label: string }
  | { type: "delta"; text: string }
  | { type: "suggestions"; items: string[] }
  | { type: "done"; messageId: string | null; apps: string[] }
  | { type: "error"; message: string };

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

function buildSystemPrompt(providers: string[], hasTools: boolean): string {
  const connected = providers.length ? providers.join(", ") : "none";
  return `You are Aster, the user's personal AI assistant. You answer questions about their day and their connected apps.
Current time: ${new Date().toISOString()}.
Connected apps: ${connected}. Live data tools exist only for Gmail and WhatsApp.
Rules:
- ${hasTools ? "For any question about the user's real emails, messages, contacts, or activity, call the tools to fetch live data BEFORE answering. Prefer small counts." : "No live data tools are available. Answer generally and suggest connecting Gmail or WhatsApp on the Integrations page for live answers."}
- NEVER invent senders, messages, counts, times, or content. If a tool fails or returns nothing, say so plainly.
- Ask before sending any email or message on the user's behalf unless they explicitly asked you to send it.
- Format answers in GitHub-flavored markdown: short headings, bullet lists, tables for structured comparisons, **bold** for key facts, fenced code blocks only for code.
- Refer to apps by their plain names (Gmail, WhatsApp, Slack...).
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
    for (const call of delta.tool_calls ?? []) {
      const index = call.index ?? 0;
      partials[index] ??= { id: "", name: "", args: "" };
      if (call.id) partials[index].id = call.id;
      if (call.function?.name) partials[index].name += call.function.name;
      if (call.function?.arguments) partials[index].args += call.function.arguments;
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

/**
 * One completion round. Tries streaming; providers that reject streaming
 * (400) get one non-streaming retry whose text is emitted as a single delta.
 */
async function completeOnce(
  messages: WireMessage[],
  tools: AgentTool[],
  allowTools: boolean,
  onDelta: (text: string) => void,
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
      signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
    });

  let res = await request(true);
  // Provider 5xx errors are usually transient; retry once before failing.
  if (res.status >= 500) res = await request(true);
  if (res.ok) return readCompletionStream(res, onDelta);

  if (res.status === 400) {
    res = await request(false);
    if (res.ok) {
      const parsed = (await res.json()) as {
        choices?: {
          message?: { content?: string | null; tool_calls?: WireToolCall[] };
        }[];
      };
      const message = parsed.choices?.[0]?.message;
      const content = typeof message?.content === "string" ? message.content : "";
      if (content) onDelta(content);
      return { content, toolCalls: message?.tool_calls ?? [] };
    }
  }
  throw new Error(`AI request failed (${res.status}).`);
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
    return items
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (item.length > 80 ? `${item.slice(0, 79)}…` : item))
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
}): Promise<void> {
  const { userId, message, emit } = options;

  pruneExpired(userId).catch(() => {});

  let conversationId = options.conversationId;
  if (!conversationId || !(await conversationExists(userId, conversationId))) {
    conversationId =
      (await getActiveConversationId(userId)) ??
      (await createConversation(userId));
  }
  emit({ type: "meta", conversationId });

  const history = await listMessages(conversationId, HISTORY_MESSAGES);
  await saveMessage(conversationId, userId, "user", message);

  const providers = await connectedProviders(userId);
  const tools = buildAgentTools(providers);

  const messages: WireMessage[] = [
    { role: "system", content: buildSystemPrompt(providers, tools.length > 0) },
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

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    roundStart = fullText.length;
    const allowTools = round < MAX_TOOL_ROUNDS - 1;
    const result = await completeOnce(messages, tools, allowTools, onDelta);

    if (!result.toolCalls.length) break;

    messages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.toolCalls,
    });
    for (const call of result.toolCalls) {
      const tool = toolsByName.get(call.function.name);
      if (!tool) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Unknown tool: ${call.function.name}`,
        });
        continue;
      }
      emit({
        type: "status",
        app: tool.provider,
        label: toolTitle(tool.toolName),
      });
      const output = await executeAgentTool(
        userId,
        tool,
        parseToolArgs(call.function.arguments),
      );
      appsUsed.add(tool.provider);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: output.slice(0, TOOL_RESULT_CHARS),
      });
    }
  }

  if (!fullText.trim()) {
    fullText = "I couldn't put together an answer this time. Please try again.";
    emit({ type: "delta", text: fullText });
  }

  const apps = [...appsUsed];
  const suggestions = await generateSuggestions(message, fullText);
  const messageId = await saveMessage(
    conversationId,
    userId,
    "assistant",
    fullText,
    apps,
    suggestions,
  );
  await touchConversation(conversationId);

  if (suggestions.length) emit({ type: "suggestions", items: suggestions });
  emit({ type: "done", messageId, apps });
}
