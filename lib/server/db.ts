import { Pool, types } from "pg";

// The previous backend returned rows as JSON over HTTP, so the entire
// codebase types timestamptz columns as ISO strings. Keep that contract
// (OID 1184 = timestamptz) instead of node-postgres' default Date objects.
types.setTypeParser(1184, (value) => new Date(value).toISOString());

declare global {
  // eslint-disable-next-line no-var
  var __asterPgPool: Pool | undefined;
}

/**
 * Hosted Postgres (Neon, Supabase, Vercel Postgres) hands out a single
 * connection string and refuses non-TLS connections; a local or same-VM
 * Postgres uses the discrete POSTGRES_* vars and speaks plaintext over
 * loopback. Support both instead of forcing one shape.
 */
function createPool(): Pool {
  const connectionString =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null;

  const shared = {
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
  };

  if (connectionString) {
    return new Pool({
      ...shared,
      connectionString,
      // Verify the chain by default. Providers that terminate TLS with a
      // self-signed cert (some Supabase poolers) need the opt-out.
      ssl:
        process.env.POSTGRES_SSL_NO_VERIFY === "true"
          ? { rejectUnauthorized: false }
          : true,
      // Serverless gives every concurrent instance its own pool, so a
      // double-digit cap here multiplies into the provider's connection
      // limit. Keep it small and let the provider's pooler fan out.
      max: Number(process.env.POSTGRES_POOL_MAX ?? 3),
    });
  }

  return new Pool({
    ...shared,
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DB ?? "Personal_assistant_db",
    user: process.env.POSTGRES_USER ?? "postgres",
    password: process.env.POSTGRES_PASSWORD,
    max: Number(process.env.POSTGRES_POOL_MAX ?? 10),
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
