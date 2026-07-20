import { HISTORY_WINDOW } from "@/lib/agent-protocol";
import { adminSql } from "@/lib/server/db";
import { ensureAgentTables } from "./schema";

/**
 * Persistence for agent conversations. A conversation is "active" while it
 * has been touched within HISTORY_WINDOW; everything older is pruned, which
 * is what keeps chat history valid for one day only.
 */

export type AgentMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  apps: string[];
  suggestions: string[];
  created_at: string;
};

/** jsonb columns arrive parsed from pg, but guard against strings too. */
function parseStringArray(value: unknown): string[] {
  const raw =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return [];
          }
        })()
      : value;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

function toMessageRow(row: Record<string, unknown>): AgentMessageRow {
  return {
    id: String(row.id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: typeof row.content === "string" ? row.content : "",
    apps: parseStringArray(row.apps),
    suggestions: parseStringArray(row.suggestions),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

/** Latest conversation still inside the one-day validity window. */
export async function getActiveConversationId(
  userId: string,
): Promise<string | null> {
  await ensureAgentTables();
  const rows = await adminSql<{ id: string }>(
    `SELECT id FROM agent_conversations
     WHERE user_id = $1 AND updated_at > now() - interval '${HISTORY_WINDOW}'
     ORDER BY updated_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0]?.id ?? null;
}

/** Verifies the conversation belongs to the user and is still active. */
export async function conversationExists(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  await ensureAgentTables();
  const rows = await adminSql<{ id: string }>(
    `SELECT id FROM agent_conversations
     WHERE id = $1 AND user_id = $2
       AND updated_at > now() - interval '${HISTORY_WINDOW}'`,
    [conversationId, userId],
  );
  return rows.length > 0;
}

export async function createConversation(userId: string): Promise<string> {
  await ensureAgentTables();
  const rows = await adminSql<{ id: string }>(
    "INSERT INTO agent_conversations (user_id) VALUES ($1) RETURNING id",
    [userId],
  );
  return rows[0].id;
}

export async function touchConversation(conversationId: string): Promise<void> {
  await adminSql(
    "UPDATE agent_conversations SET updated_at = now() WHERE id = $1",
    [conversationId],
  );
}

/**
 * Full transcript in chronological order, for rendering the page.
 * `limit` guards against an unbounded payload on a very long day.
 */
export async function listMessages(
  conversationId: string,
  limit = 200,
): Promise<AgentMessageRow[]> {
  await ensureAgentTables();
  const rows = await adminSql<Record<string, unknown>>(
    `SELECT id, role, content, apps, suggestions, created_at
     FROM agent_messages WHERE conversation_id = $1
     ORDER BY created_at ASC, id ASC LIMIT $2`,
    [conversationId, limit],
  );
  return rows.map(toMessageRow);
}

/**
 * The most recent `limit` messages, returned oldest-first for the model.
 *
 * The inner ORDER BY is DESC so the LIMIT keeps the NEWEST turns; the outer
 * one restores chronological order. Selecting with a plain `ASC LIMIT` (as
 * this did previously) pins the model to the opening of the conversation and
 * silently drops all recent context once the transcript exceeds the limit.
 */
export async function listRecentMessages(
  conversationId: string,
  limit: number,
): Promise<AgentMessageRow[]> {
  await ensureAgentTables();
  const rows = await adminSql<Record<string, unknown>>(
    `SELECT * FROM (
       SELECT id, role, content, apps, suggestions, created_at
       FROM agent_messages WHERE conversation_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2
     ) recent ORDER BY created_at ASC, id ASC`,
    [conversationId, limit],
  );
  return rows.map(toMessageRow);
}

export async function saveMessage(
  conversationId: string,
  userId: string,
  role: "user" | "assistant",
  content: string,
  apps: string[] = [],
  suggestions: string[] = [],
): Promise<string> {
  const rows = await adminSql<{ id: string }>(
    `INSERT INTO agent_messages
       (conversation_id, user_id, role, content, apps, suggestions)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING id`,
    [
      conversationId,
      userId,
      role,
      content,
      JSON.stringify(apps),
      JSON.stringify(suggestions),
    ],
  );
  return rows[0].id;
}

/** Attaches quick replies once they have been generated, post-answer. */
export async function attachSuggestions(
  messageId: string,
  suggestions: string[],
): Promise<void> {
  await adminSql(
    "UPDATE agent_messages SET suggestions = $2::jsonb WHERE id = $1",
    [messageId, JSON.stringify(suggestions)],
  );
}

/** Deletes the user's conversations (and messages) past the validity window. */
export async function pruneExpired(userId: string): Promise<void> {
  await ensureAgentTables();
  // Messages first: adminSql allows one statement per call, so a mid-prune
  // failure must not orphan rows by removing the parent conversation first.
  await adminSql(
    `DELETE FROM agent_messages WHERE user_id = $1 AND conversation_id IN (
       SELECT id FROM agent_conversations
       WHERE user_id = $1 AND updated_at <= now() - interval '${HISTORY_WINDOW}')`,
    [userId],
  );
  await adminSql(
    `DELETE FROM agent_conversations
     WHERE user_id = $1 AND updated_at <= now() - interval '${HISTORY_WINDOW}'`,
    [userId],
  );
}
