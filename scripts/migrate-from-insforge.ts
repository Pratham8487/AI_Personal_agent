/**
 * One-shot data migration: InsForge (hosted) -> local PostgreSQL.
 *
 * Reads via InsForge's rawsql endpoint (INSFORGE_ADMIN_API_KEY) and inserts
 * into the local database with ON CONFLICT DO NOTHING, preserving uuids and
 * timestamps. Safe to re-run BEFORE local writes begin; do not re-run after
 * go-live (it could resurrect locally deleted rows). Never writes to InsForge.
 *
 * Run: npm run db:import-insforge  (stop `npm run dev` first so WhatsApp
 * auth-state writes are frozen for a consistent copy).
 */
import { Client } from "pg";

const BASE_URL = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL;
const ADMIN_KEY = process.env.INSFORGE_ADMIN_API_KEY;
const BATCH = 1000;

if (!BASE_URL || !ADMIN_KEY) {
  console.error(
    "NEXT_PUBLIC_INSFORGE_BASE_URL and INSFORGE_ADMIN_API_KEY must be set to migrate."
  );
  process.exit(1);
}

async function insforgeSql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const request = () =>
    fetch(`${BASE_URL}/api/database/advance/rawsql`, {
      method: "POST",
      headers: { "x-api-key": ADMIN_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ query, params }),
      signal: AbortSignal.timeout(30_000),
    });
  let res: Response;
  try {
    res = await request();
  } catch {
    res = await request(); // stale keep-alive connection; retry once
  }
  if (!res.ok) {
    throw new Error(`InsForge SQL request failed (${res.status}): ${query.slice(0, 80)}`);
  }
  const result = (await res.json()) as { rows: T[] };
  return result.rows;
}

type TableSpec = {
  name: string;
  columns: string[];
  /** Columns that must be JSON.stringify'd and cast ::jsonb on insert. */
  jsonb: string[];
  /** Full PK column list, for stable pagination. */
  orderBy: string;
};

// FK-safe order: users first; the agent/briefing/refresh tables have no FKs.
const TABLES: TableSpec[] = [
  {
    name: "users",
    columns: [
      "id", "email", "name", "avatar_url", "providers", "email_verified",
      "phone", "verification_method", "last_login_at", "created_at", "updated_at",
    ],
    jsonb: [],
    orderBy: "id",
  },
  {
    name: "phone_otps",
    columns: ["id", "phone", "otp_hash", "attempts", "expires_at", "consumed_at", "created_at"],
    jsonb: [],
    orderBy: "id",
  },
  {
    name: "user_integrations",
    columns: ["id", "user_id", "provider", "status", "connected_at", "metadata", "created_at", "updated_at"],
    jsonb: ["metadata"],
    orderBy: "id",
  },
  {
    name: "user_settings",
    columns: ["user_id", "briefing_time", "timezone", "channels", "updated_at"],
    jsonb: ["channels"],
    orderBy: "user_id",
  },
  {
    name: "gmail_oauth_tokens",
    columns: ["user_id", "access_token", "refresh_token", "expires_at", "scope", "created_at", "updated_at"],
    jsonb: [],
    orderBy: "user_id",
  },
  {
    name: "whatsapp_auth_state",
    columns: ["user_id", "key", "value", "updated_at"],
    jsonb: ["value"],
    orderBy: "user_id, key",
  },
  {
    name: "whatsapp_chats",
    columns: ["user_id", "jid", "name", "is_group", "last_message_at", "updated_at"],
    jsonb: [],
    orderBy: "user_id, jid",
  },
  {
    name: "whatsapp_messages",
    columns: [
      "user_id", "chat_jid", "msg_id", "sender_jid", "sender_name",
      "from_me", "text", "msg_type", "sent_at", "created_at",
    ],
    jsonb: [],
    orderBy: "user_id, chat_jid, msg_id",
  },
  {
    name: "whatsapp_sessions",
    columns: ["user_id", "phone", "wa_jid", "linked_at", "last_connected_at", "created_at", "updated_at"],
    jsonb: [],
    orderBy: "user_id",
  },
  {
    name: "dashboard_briefs",
    columns: ["user_id", "signature", "data", "generated_at"],
    jsonb: ["data"],
    orderBy: "user_id",
  },
  {
    name: "agent_conversations",
    columns: ["id", "user_id", "created_at", "updated_at"],
    jsonb: [],
    orderBy: "id",
  },
  {
    name: "agent_messages",
    columns: ["id", "conversation_id", "user_id", "role", "content", "apps", "suggestions", "created_at"],
    jsonb: ["apps", "suggestions"],
    orderBy: "id",
  },
  {
    name: "briefings",
    columns: [
      "id", "user_id", "name", "description", "is_default", "apps", "categories",
      "priority", "frequency", "schedule_time", "timezone", "run_at", "enabled",
      "next_run_at", "created_at", "updated_at",
    ],
    jsonb: ["apps", "categories"],
    orderBy: "id",
  },
  {
    name: "briefing_runs",
    columns: [
      "id", "briefing_id", "user_id", "scheduled_for", "source", "status",
      "started_at", "finished_at", "error", "result_id", "created_at",
    ],
    jsonb: [],
    orderBy: "id",
  },
  {
    name: "briefing_results",
    columns: ["id", "briefing_id", "user_id", "run_id", "data", "degraded", "generated_at"],
    jsonb: ["data"],
    orderBy: "id",
  },
  {
    name: "ai_refresh_logs",
    columns: ["id", "user_id", "feature", "refreshed_at"],
    jsonb: [],
    orderBy: "id",
  },
];

function localClient(): Client {
  return new Client({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DB ?? "Personal_assistant_db",
    user: process.env.POSTGRES_USER ?? "postgres",
    password: process.env.POSTGRES_PASSWORD,
  });
}

async function copyTable(local: Client, spec: TableSpec): Promise<number> {
  const cols = spec.columns.join(", ");
  let offset = 0;
  let copied = 0;
  for (;;) {
    const rows = await insforgeSql<Record<string, unknown>>(
      `SELECT ${cols} FROM public.${spec.name} ORDER BY ${spec.orderBy} LIMIT ${BATCH} OFFSET ${offset}`
    );
    if (rows.length === 0) break;

    const values: unknown[] = [];
    const tuples = rows.map((row, r) => {
      const placeholders = spec.columns.map((col, c) => {
        const value = row[col];
        values.push(
          spec.jsonb.includes(col) && value !== null ? JSON.stringify(value) : value
        );
        const cast = spec.jsonb.includes(col) ? "::jsonb" : "";
        return `$${r * spec.columns.length + c + 1}${cast}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    const inserted = await local.query(
      `INSERT INTO public.${spec.name} (${cols}) VALUES ${tuples.join(", ")}
       ON CONFLICT DO NOTHING`,
      values
    );
    copied += inserted.rowCount ?? 0;
    offset += rows.length;
    if (rows.length < BATCH) break;
  }
  return copied;
}

/** Ports auth.users password hashes and OAuth linkage into the local schema. */
async function importAuthData(local: Client): Promise<void> {
  let authColumns: { column_name: string }[] = [];
  try {
    authColumns = await insforgeSql<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'auth' AND table_name = 'users'`
    );
  } catch {
    console.warn(
      "WARNING: auth.users is not readable — password hashes were NOT migrated.\n" +
        "Email/password users will need a password reset."
    );
    return;
  }
  const names = authColumns.map((c) => c.column_name);
  const hashColumn = ["password", "encrypted_password", "password_hash"].find((c) =>
    names.includes(c)
  );
  if (!hashColumn) {
    console.warn(
      `WARNING: no password column found in auth.users (columns: ${names.join(", ")}).\n` +
        "Email/password users will need a password reset."
    );
  } else {
    const authUsers = await insforgeSql<{
      id: string;
      email: string | null;
      hash: string | null;
      name: string | null;
      email_verified: boolean;
    }>(
      `SELECT id, email, ${hashColumn} AS hash,
              profile->>'name' AS name, email_verified
       FROM auth.users`
    );
    for (const user of authUsers) {
      // Covers accounts that were never mirrored into public.users.
      await local.query(
        `INSERT INTO public.users (id, email, name, email_verified)
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [user.id, user.email, user.name, user.email_verified]
      );
      if (user.hash) {
        await local.query(
          `UPDATE public.users SET password_hash = $2
           WHERE id = $1 AND password_hash IS NULL`,
          [user.id, user.hash]
        );
      }
    }
    console.log(`auth.users: ported ${authUsers.length} accounts (hash column: ${hashColumn})`);
  }

  try {
    const providers = await insforgeSql<{
      user_id: string;
      provider: string;
      provider_account_id: string;
    }>(`SELECT user_id, provider, provider_account_id FROM auth.user_providers`);
    for (const p of providers) {
      await local.query(
        `INSERT INTO public.user_identities (user_id, provider, provider_account_id)
         VALUES ($1, $2, $3) ON CONFLICT (provider, provider_account_id) DO NOTHING`,
        [p.user_id, p.provider, p.provider_account_id]
      );
    }
    console.log(`auth.user_providers: ported ${providers.length} identities`);
  } catch {
    console.warn(
      "WARNING: auth.user_providers is not readable — Google accounts will link by email on first sign-in."
    );
  }
}

async function verify(local: Client): Promise<boolean> {
  let ok = true;
  console.log("\nVerification (source vs local):");
  for (const spec of TABLES) {
    const [src] = await insforgeSql<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.${spec.name}`
    );
    const dst = await local.query(`SELECT count(*)::int AS n FROM public.${spec.name}`);
    const match = src.n === dst.rows[0].n;
    if (!match) ok = false;
    console.log(
      `  ${spec.name.padEnd(22)} source=${String(src.n).padStart(6)}  local=${String(
        dst.rows[0].n
      ).padStart(6)}  ${match ? "OK" : "MISMATCH"}`
    );
  }
  // Cheap content checksums on the two highest-value tables.
  const checks: [string, string][] = [
    [
      "whatsapp_auth_state bytes",
      "SELECT coalesce(sum(length(value::text)),0)::bigint AS v FROM public.whatsapp_auth_state",
    ],
    [
      "whatsapp_messages md5",
      "SELECT coalesce(md5(string_agg(msg_id, ',' ORDER BY user_id, chat_jid, msg_id)),'-') AS v FROM public.whatsapp_messages",
    ],
  ];
  for (const [label, query] of checks) {
    const [src] = await insforgeSql<{ v: unknown }>(query);
    const dst = await local.query(query);
    const match = String(src.v) === String(dst.rows[0].v);
    if (!match) ok = false;
    console.log(`  ${label.padEnd(28)} ${match ? "OK" : `MISMATCH (${src.v} vs ${dst.rows[0].v})`}`);
  }
  return ok;
}

async function main() {
  const local = localClient();
  await local.connect();
  try {
    for (const spec of TABLES) {
      const copied = await copyTable(local, spec);
      console.log(`${spec.name}: inserted ${copied} rows`);
      if (spec.name === "users") await importAuthData(local);
    }
    // bigserial rows were inserted with explicit ids; realign the sequence.
    await local.query(
      `SELECT setval(pg_get_serial_sequence('public.ai_refresh_logs','id'),
              GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.ai_refresh_logs), 1))`
    );

    const ok = await verify(local);
    if (!ok) {
      console.error("\nMigration completed WITH MISMATCHES — investigate before cutover.");
      process.exit(1);
    }
    console.log("\nMigration complete — all counts and checksums match.");
  } finally {
    await local.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
