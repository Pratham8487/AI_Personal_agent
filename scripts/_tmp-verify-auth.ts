/* Temporary end-to-end verification of the access/refresh token + OTP system. */
import { Client } from "pg";

const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";
const EMAIL = `verify-${Math.random().toString(36).slice(2, 8)}@aster.test`;
const PASSWORD = "verify-pass-123";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

type Jar = { access?: string; refresh?: string };

function absorb(res: Response, jar: Jar) {
  for (const header of res.headers.getSetCookie()) {
    const access = header.match(/^aster_access=([^;]*)/);
    if (access) jar.access = access[1];
    const refresh = header.match(/^aster_refresh=([^;]*)/);
    if (refresh) jar.refresh = refresh[1];
  }
}

function cookieHeader(jar: Jar): string {
  const parts = [];
  if (jar.access) parts.push(`aster_access=${jar.access}`);
  if (jar.refresh) parts.push(`aster_refresh=${jar.refresh}`);
  return parts.join("; ");
}

function db(): Client {
  return new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  });
}

async function me(jar: Jar): Promise<{ email: string } | null> {
  const res = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: cookieHeader(jar) } });
  return ((await res.json()) as { user: { email: string } | null }).user;
}

async function main() {
  const client = db();
  await client.connect();
  const jar: Jar = {};

  // --- sign-up issues both cookies -----------------------------------------
  const signUp = await fetch(`${BASE}/api/auth/sign-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Verify Bot" }),
  });
  absorb(signUp, jar);
  const signUpBody = (await signUp.json()) as { requiresVerification?: boolean };
  check("sign-up 200 + access + refresh cookies", signUp.status === 200 && !!jar.access && !!jar.refresh);
  check("sign-up flags requiresVerification", signUpBody.requiresVerification === true);
  check("me works with access token", (await me(jar))?.email === EMAIL);

  const userRow = await client.query(`SELECT id, email_verified FROM users WHERE email = $1`, [EMAIL]);
  const userId = userRow.rows[0].id;
  check("new user starts unverified", userRow.rows[0].email_verified === false);

  // --- email verification via OTP row --------------------------------------
  // AUTH_DEV_LOG_OTP prints codes to the server console; for automation we
  // reconstruct nothing — instead verify the row exists, then exercise the
  // wrong-code path and consume attempts.
  const otpRow = await client.query(
    `SELECT otp_type, active, attempt_count FROM user_otp_verifications
     WHERE target = $1 AND otp_type = 'EMAIL_VERIFICATION' AND active`,
    [EMAIL]
  );
  check("EMAIL_VERIFICATION otp row created", otpRow.rowCount === 1);

  const wrong = await fetch(`${BASE}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, otp: "000000" }),
  });
  check("wrong verification code rejected", wrong.status === 400);
  const attempts = await client.query(
    `SELECT attempt_count FROM user_otp_verifications
     WHERE target = $1 AND otp_type = 'EMAIL_VERIFICATION' AND active`,
    [EMAIL]
  );
  check("attempt_count incremented", attempts.rows[0]?.attempt_count === 1);

  // --- access expiry + refresh rotation -------------------------------------
  await client.query(
    `UPDATE user_access_tokens SET expires_at = now() - interval '1 second'
     WHERE user_id = $1 AND revoked = false`,
    [userId]
  );
  check("me null after access expiry", (await me(jar)) === null);

  const oldRefresh = jar.refresh!;
  const refresh1 = await fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { cookie: cookieHeader(jar) },
  });
  absorb(refresh1, jar);
  check("refresh returns new pair", refresh1.status === 200 && jar.refresh !== oldRefresh);
  check("me works after refresh", (await me(jar))?.email === EMAIL);

  const families = await client.query(
    `SELECT count(DISTINCT family_id)::int AS n,
            count(*) FILTER (WHERE revoked)::int AS revoked_count
     FROM user_refresh_tokens WHERE user_id = $1`,
    [userId]
  );
  check("rotation stays in one family", families.rows[0].n === 1);
  check("old refresh token revoked", families.rows[0].revoked_count === 1);

  // --- reuse detection (theft) ----------------------------------------------
  await client.query(
    `UPDATE user_refresh_tokens SET last_used_at = now() - interval '60 seconds'
     WHERE user_id = $1 AND revoked = true`,
    [userId]
  );
  const replay = await fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { cookie: `aster_refresh=${oldRefresh}` },
  });
  check("replayed old refresh token gets 401", replay.status === 401);
  const afterTheft = await client.query(
    `SELECT count(*) FILTER (WHERE NOT revoked)::int AS live
     FROM user_refresh_tokens WHERE user_id = $1`,
    [userId]
  );
  check("whole family revoked on reuse", afterTheft.rows[0].live === 0);
  check("live access token also dead", (await me(jar)) === null);

  // --- password reset flow ---------------------------------------------------
  const forgotReal = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL }),
  });
  const forgotFake = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nobody@aster.test" }),
  });
  check(
    "forgot-password uniform 200s (anti-enumeration)",
    forgotReal.status === 200 && forgotFake.status === 200
  );
  const resetRows = await client.query(
    `SELECT r.active, o.otp_type FROM password_reset_requests r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN user_otp_verifications o
       ON o.target = u.email AND o.otp_type = 'PASSWORD_RESET' AND o.active
     WHERE u.email = $1 AND r.active`,
    [EMAIL]
  );
  check("reset request + PASSWORD_RESET otp rows created", resetRows.rowCount === 1 && resetRows.rows[0].otp_type === "PASSWORD_RESET");

  // --- disabled account ------------------------------------------------------
  await client.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  const signInDisabled = await fetch(`${BASE}/api/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check("disabled account sign-in gets 403", signInDisabled.status === 403);
  await client.query(`UPDATE users SET active = true WHERE id = $1`, [userId]);

  // --- sign-in / sign-out round trip ----------------------------------------
  const jar2: Jar = {};
  const signIn = await fetch(`${BASE}/api/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  absorb(signIn, jar2);
  check("sign-in issues fresh pair", signIn.status === 200 && !!jar2.access && !!jar2.refresh);
  const signOut = await fetch(`${BASE}/api/auth/sign-out`, {
    method: "POST",
    headers: { cookie: cookieHeader(jar2) },
  });
  check("sign-out 200", signOut.status === 200);
  check("me null after sign-out", (await me(jar2)) === null);

  // --- cleanup ----------------------------------------------------------------
  await client.query(`DELETE FROM users WHERE email = $1`, [EMAIL]);
  await client.query(`DELETE FROM user_otp_verifications WHERE target = $1`, [EMAIL]);
  console.log("test user cleaned up");
  await client.end();

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
