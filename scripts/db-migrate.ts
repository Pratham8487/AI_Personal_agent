import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";

const HOST = process.env.POSTGRES_HOST ?? "localhost";
const PORT = Number(process.env.POSTGRES_PORT ?? 5432);
const DB = process.env.POSTGRES_DB ?? "Personal_assistant_db";
const USER = process.env.POSTGRES_USER ?? "postgres";
const PASSWORD = process.env.POSTGRES_PASSWORD;

// Mirrors lib/server/db.ts: a connection string means hosted Postgres (TLS
// required, database already provisioned), its absence means local/VM.
const CONNECTION_STRING =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null;
const SSL =
  process.env.POSTGRES_SSL_NO_VERIFY === "true"
    ? { rejectUnauthorized: false }
    : true;

/** Connection config for the app's own database. */
function targetConfig() {
  return CONNECTION_STRING
    ? { connectionString: CONNECTION_STRING, ssl: SSL }
    : { host: HOST, port: PORT, user: USER, password: PASSWORD, database: DB };
}

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

async function ensureDatabase(): Promise<void> {
  // Hosted providers create the database for you and refuse both the
  // `postgres` maintenance database and CREATE DATABASE, so there is
  // nothing to do — and attempting it fails the whole migration run.
  if (CONNECTION_STRING) {
    console.log("Connection string set — assuming the database exists.");
    return;
  }
  const client = new Client({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: "postgres",
  });
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [DB]
    );
    if (existing.rowCount === 0) {
      // Identifier, not a parameter — quoted because the name is mixed-case.
      await client.query(`CREATE DATABASE "${DB.replace(/"/g, '""')}"`);
      console.log(`Created database "${DB}"`);
    }
  } finally {
    await client.end();
  }
}

async function applyMigrations(): Promise<void> {
  const client = new Client(targetConfig());
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    );
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    let applied = 0;
    for (const file of files) {
      const done = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [file]
      );
      if ((done.rowCount ?? 0) > 0) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      console.log(`Applied ${file}`);
      applied += 1;
    }
    if (applied === 0) console.log("Nothing to apply — schema is up to date.");
  } finally {
    await client.end();
  }
}

async function main() {
  await ensureDatabase();
  await applyMigrations();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
