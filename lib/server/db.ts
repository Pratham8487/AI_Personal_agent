import { Pool, types } from "pg";

// The previous backend returned rows as JSON over HTTP, so the entire
// codebase types timestamptz columns as ISO strings. Keep that contract
// (OID 1184 = timestamptz) instead of node-postgres' default Date objects.
types.setTypeParser(1184, (value) => new Date(value).toISOString());

declare global {
  // eslint-disable-next-line no-var
  var __asterPgPool: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DB ?? "Personal_assistant_db",
    user: process.env.POSTGRES_USER ?? "postgres",
    password: process.env.POSTGRES_PASSWORD,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
  });
}

// Next.js dev hot-reload re-evaluates modules; park the pool on globalThis
// (same pattern as the Baileys socket map in whatsapp-manager.ts).
export const pool: Pool = (globalThis.__asterPgPool ??= createPool());

/** Runs SQL against the local Postgres database. Server-side only. */
export async function adminSql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query(query, params);
  return result.rows as T[];
}
