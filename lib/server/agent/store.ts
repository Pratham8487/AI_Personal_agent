import { adminSql } from "@/lib/server/phone-auth";
import { ensureAgentTables } from "./schema";

/** Chat history stays valid for one day; older conversations are pruned. */
const ACTIVE_WINDOW = "1 day";

export type AgentMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  apps: string[];
  suggestions: string[];
  created_at: string;
};

/** jsonb columns arrive parsed from rawsql, but guard against strings too. */
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

/** Latest conversation still inside the one-day validity window. */
export async function getActiveConversationId(
  userId: string,
): Promise<string | null> {
  await ensureAgentTables();
  const rows = await adminSql<{ id: string }>(
    `SELECT id FROM agent_conversations
     WHERE user_id = $1 AND updated_at > now() - interval '${ACTIVE_WINDOW}'
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
       AND updated_at > now() - interval '${ACTIVE_WINDOW}'`,
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

export async function touchConversation(
  conversationId: string,
): Promise<void> {
  await adminSql(
    "UPDATE agent_conversations SET updated_at = now() WHERE id = $1",
    [conversationId],
  );
}

export async function listMessages(
  conversationId: string,
  limit = 100,
): Promise<AgentMessageRow[]> {
  await ensureAgentTables();
  const rows = await adminSql<Record<string, unknown>>(
    `SELECT id, role, content, apps, suggestions, created_at
     FROM agent_messages WHERE conversation_id = $1
     ORDER BY created_at ASC LIMIT $2`,
    [conversationId, limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: typeof row.content === "string" ? row.content : "",
    apps: parseStringArray(row.apps),
    suggestions: parseStringArray(row.suggestions),
    created_at: String(row.created_at),
  }));
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

/** Deletes the user's conversations (and messages) past the validity window. */
export async function pruneExpired(userId: string): Promise<void> {
  await ensureAgentTables();
  // InsForge rawsql wants one statement per call.
  await adminSql(
    `DELETE FROM agent_messages WHERE user_id = $1 AND conversation_id IN (
       SELECT id FROM agent_conversations
       WHERE user_id = $1 AND updated_at <= now() - interval '${ACTIVE_WINDOW}')`,
    [userId],
  );
  await adminSql(
    `DELETE FROM agent_conversations
     WHERE user_id = $1 AND updated_at <= now() - interval '${ACTIVE_WINDOW}'`,
    [userId],
  );
}
