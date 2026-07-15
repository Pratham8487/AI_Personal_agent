import { adminSql } from "@/lib/server/db";

/**
 * Lazy one-time table setup per process (same convention as
 * lib/server/briefing/schema.ts); survives restarts via Postgres.
 */

const STATEMENTS = [
  // One row per chat session; "active" means updated within the last day.
  `CREATE TABLE IF NOT EXISTS agent_conversations (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id    uuid NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS agent_conversations_user_idx
     ON agent_conversations (user_id, updated_at DESC)`,
  // Chat transcript. apps = provider ids the assistant pulled data from;
  // suggestions = quick-reply prompts generated for the message.
  `CREATE TABLE IF NOT EXISTS agent_messages (
     id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     conversation_id uuid NOT NULL,
     user_id         uuid NOT NULL,
     role            text NOT NULL,
     content         text NOT NULL,
     apps            jsonb NOT NULL DEFAULT '[]'::jsonb,
     suggestions     jsonb NOT NULL DEFAULT '[]'::jsonb,
     created_at      timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS agent_messages_conversation_idx
     ON agent_messages (conversation_id, created_at)`,
];

let ensured: Promise<void> | null = null;

export function ensureAgentTables(): Promise<void> {
  ensured ??= (async () => {
    for (const statement of STATEMENTS) await adminSql(statement);
  })().catch((error) => {
    ensured = null; // retry on next call
    throw error;
  });
  return ensured;
}
