import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { adminSql } from "@/lib/server/db";
import {
  exchangeSignInCode,
  fetchGitHubProfile,
  fetchGitHubVerifiedEmail,
  GITHUB_OAUTH_STATE_COOKIE,
  type GitHubProfile,
} from "@/lib/server/github-signin";
import {
  createSessionTokens,
  getRequestMeta,
  setAuthCookies,
} from "@/lib/server/session";

function statesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Finds the user for this GitHub account, linking or creating as needed. */
async function resolveUserId(profile: GitHubProfile, email: string | null): Promise<string> {
  const accountId = String(profile.id);
  const name = profile.name ?? profile.login;

  const byAccount = await adminSql<{ user_id: string }>(
    `SELECT user_id FROM public.user_identities
     WHERE provider = 'github' AND provider_account_id = $1`,
    [accountId]
  );
  if (byAccount.length > 0) {
    await adminSql(
      `UPDATE public.users SET
         name = COALESCE(name, $2),
         avatar_url = COALESCE(avatar_url, $3),
         last_login_at = now(),
         updated_at = now()
       WHERE id = $1`,
      [byAccount[0].user_id, name, profile.avatar_url ?? null]
    );
    return byAccount[0].user_id;
  }

  if (email) {
    const byEmail = await adminSql<{ id: string }>(
      `SELECT id FROM public.users WHERE lower(email) = $1`,
      [email]
    );
    if (byEmail.length > 0) {
      const userId = byEmail[0].id;
      await adminSql(
        `INSERT INTO public.user_identities (user_id, provider, provider_account_id)
         VALUES ($1, 'github', $2)
         ON CONFLICT (provider, provider_account_id) DO NOTHING`,
        [userId, accountId]
      );
      await adminSql(
        `UPDATE public.users SET
           providers = CASE WHEN 'github' = ANY(providers) THEN providers
                            ELSE array_append(providers, 'github') END,
           name = COALESCE(name, $2),
           avatar_url = COALESCE(avatar_url, $3),
           email_verified = true,
           contact_verified = true,
           last_login_at = now(),
           updated_at = now()
         WHERE id = $1`,
        [userId, name, profile.avatar_url ?? null]
      );
      return userId;
    }
  }

  const created = await adminSql<{ id: string }>(
    `INSERT INTO public.users
       (email, name, avatar_url, providers, email_verified, contact_verified, verification_method, last_login_at)
     VALUES ($1, $2, $3, ARRAY['github'], true, true, 'oauth', now())
     RETURNING id`,
    [email, name, profile.avatar_url ?? null]
  );
  const userId = created[0].id;
  await adminSql(
    `INSERT INTO public.user_identities (user_id, provider, provider_account_id)
     VALUES ($1, 'github', $2)`,
    [userId, accountId]
  );
  return userId;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (code: string) =>
    Response.redirect(new URL(`/sign-in?error=${code}`, url.origin));

  if (url.searchParams.get("error")) return fail("github_denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GITHUB_OAUTH_STATE_COOKIE)?.value;
  cookieStore.set(GITHUB_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });

  if (!code || !state || !expectedState || !statesMatch(state, expectedState)) {
    return fail("github_state");
  }

  try {
    const tokens = await exchangeSignInCode(code, url.origin);
    const profile = await fetchGitHubProfile(tokens.access_token);
    if (!profile.id) return fail("github_profile");
    const email = (await fetchGitHubVerifiedEmail(tokens.access_token))?.toLowerCase() ?? null;

    const userId = await resolveUserId(profile, email);
    const activeRows = await adminSql<{ active: boolean }>(
      `SELECT active FROM public.users WHERE id = $1`,
      [userId]
    );
    if (!activeRows[0]?.active) return fail("account_disabled");

    const pair = await createSessionTokens(userId, await getRequestMeta());
    await setAuthCookies(pair);
    return Response.redirect(new URL("/dashboard", url.origin));
  } catch (error) {
    console.error("GitHub sign-in callback failed:", error);
    return fail("github_failed");
  }
}
