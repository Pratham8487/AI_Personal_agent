/**
 * Wire protocol shared by the agent route handler and the client chat hook.
 *
 * Deliberately free of server-only imports so both sides depend on this one
 * definition — previously the event union was written out twice and could
 * drift silently between producer and consumer.
 *
 * Event order for one successful turn:
 *   meta → (tool_start/tool_end)* → delta* → done → suggestions?
 *
 * `done` is emitted before `suggestions` on purpose: quick replies take a
 * second model round-trip, and the answer must stop looking "in progress"
 * the moment its text is complete.
 */

export type AgentStreamEvent =
  /** Conversation this turn belongs to; may be freshly created server-side. */
  | { type: "meta"; conversationId: string }
  /** A tool call started. `id` correlates with the matching tool_end. */
  | { type: "tool_start"; id: string; app: string; label: string }
  /** A tool call finished. `ok` is false when the tool threw or errored. */
  | { type: "tool_end"; id: string; ok: boolean }
  /** Incremental answer text. */
  | { type: "delta"; text: string }
  /** Answer text is complete and persisted. */
  | { type: "done"; messageId: string | null; apps: string[] }
  /** Quick-reply prompts, generated after the answer completed. */
  | { type: "suggestions"; items: string[] }
  /** Terminal failure; the turn produced no usable answer. */
  | { type: "error"; message: string };

export type AgentRole = "user" | "assistant";

/** One persisted chat message as sent to the client. */
export type AgentMessagePayload = {
  id: string;
  role: AgentRole;
  content: string;
  apps: string[];
  suggestions: string[];
  createdAt: string;
};

/** Matches the client-side composer limit and the route's validation. */
export const MAX_MESSAGE_CHARS = 4_000;

/** Chat history stays valid for one day; older conversations are pruned. */
export const HISTORY_WINDOW = "1 day";
