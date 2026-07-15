import { Client } from "pg";

const c = new Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function main() {
  await c.connect();
  await c.query("DELETE FROM users WHERE email LIKE '%@aster.test'");
  await c.query("DELETE FROM user_otp_verifications WHERE target LIKE '%@aster.test'");
  const users = await c.query(
    "SELECT email, phone, email_verified, contact_verified, active, tour_completed FROM users ORDER BY created_at"
  );
  console.table(users.rows);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
