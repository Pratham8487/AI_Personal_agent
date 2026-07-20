import { adminSql } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/passwords";
import { assertSameOrigin } from "@/lib/server/request-origin";
import {
  createSessionTokens,
  getRequestMeta,
  setAuthCookies,
  type SessionUser,
} from "@/lib/server/session";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  providers: string[];
  email_verified: boolean;
  contact_verified: boolean;
  tour_completed: boolean;
  active: boolean;
  password_hash: string | null;
};

export async function POST(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  try {
    const rows = await adminSql<UserRow>(
      `SELECT id, email, name, avatar_url, phone, providers, email_verified,
              contact_verified, tour_completed, active, password_hash
       FROM public.users WHERE lower(email) = $1`,
      [email]
    );
    const row = rows[0] as UserRow | undefined;

    const valid = await verifyPassword(password, row?.password_hash ?? null);
    if (!valid) {
      // Deliberate UX exception to the uniform error: Google-only accounts
      // have no password to type.
      if (row && !row.password_hash && (row.providers ?? []).includes("google")) {
        return Response.json(
          { error: "This account uses Google sign-in. Continue with Google instead." },
          { status: 401 }
        );
      }
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }
    // Checked only after the password verified, so it leaks nothing to guessers.
    if (!row!.active) {
      return Response.json({ error: "This account is disabled." }, { status: 403 });
    }

    await adminSql(
      `UPDATE public.users SET last_login_at = now(), updated_at = now() WHERE id = $1`,
      [row!.id]
    );

    const user: SessionUser = {
      id: row!.id,
      email: row!.email,
      name: row!.name,
      avatarUrl: row!.avatar_url,
      phone: row!.phone,
      providers: row!.providers ?? [],
      emailVerified: row!.email_verified,
      contactVerified: row!.contact_verified,
      tourCompleted: row!.tour_completed,
      active: row!.active,
    };
    const pair = await createSessionTokens(user.id, await getRequestMeta());
    await setAuthCookies(pair);
    return Response.json({ user });
  } catch (error) {
    console.error("sign-in failed:", error);
    return Response.json({ error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
