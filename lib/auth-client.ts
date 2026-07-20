/** Client-side auth API: thin fetch wrappers over /api/auth/*. */

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  phone: string | null;
  providers: string[];
  emailVerified: boolean;
  contactVerified: boolean;
  tourCompleted: boolean;
  active: boolean;
};

type AuthResult = { user: AuthUser | null; error: string | null };
type SignUpResult = AuthResult & { verificationEmailSent?: boolean };

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight: N concurrent 401s produce exactly one refresh call per tab. */
async function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/**
 * fetch() that, on a 401, silently refreshes the session once and retries
 * once. Auth endpoints are exempt and the retry result is returned as-is,
 * so no request can loop.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, init);
  if (res.status !== 401 || path.startsWith("/api/auth/")) return res;
  if (!(await tryRefresh())) return res; // refresh failed → surface original 401
  return fetch(path, init);
}

async function postJson(path: string, body?: unknown): Promise<AuthResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      user?: AuthUser;
      error?: string;
    };
    if (!res.ok) {
      return { user: null, error: data.error ?? "Something went wrong. Please try again." };
    }
    return { user: data.user ?? null, error: null };
  } catch {
    return { user: null, error: "Network error. Please try again." };
  }
}

export async function signUp(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<SignUpResult> {
  try {
    const res = await fetch("/api/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as {
      user?: AuthUser;
      error?: string;
      verificationEmailSent?: boolean;
    };
    if (!res.ok) {
      return { user: null, error: data.error ?? "Something went wrong. Please try again." };
    }
    return {
      user: data.user ?? null,
      error: null,
      verificationEmailSent: data.verificationEmailSent,
    };
  } catch {
    return { user: null, error: "Network error. Please try again." };
  }
}

export function signIn(input: { email: string; password: string }): Promise<AuthResult> {
  return postJson("/api/auth/sign-in", input);
}

export async function signOut(): Promise<void> {
  await postJson("/api/auth/sign-out");
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const load = async (): Promise<AuthUser | null> => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return null;
      const data = (await res.json()) as { user: AuthUser | null };
      return data.user;
    } catch {
      return null;
    }
  };
  const user = await load();
  if (user) return user;
  // The access token may simply have expired — refresh once and retry.
  if (await tryRefresh()) return load();
  return null;
}

export function verifyEmail(input: { email: string; otp: string }): Promise<AuthResult> {
  return postJson("/api/auth/verify-email", input);
}

export async function resendVerification(email: string): Promise<{ error: string | null }> {
  const { error } = await postJson("/api/auth/resend-verification", { email });
  return { error };
}

export async function forgotPassword(email: string): Promise<{ error: string | null }> {
  const { error } = await postJson("/api/auth/forgot-password", { email });
  return { error };
}

export async function resetPassword(input: {
  email: string;
  otp: string;
  newPassword: string;
}): Promise<{ error: string | null }> {
  const { error } = await postJson("/api/auth/reset-password", input);
  return { error };
}

export async function updateProfile(patch: {
  tourCompleted?: boolean;
  name?: string;
}): Promise<AuthResult> {
  try {
    const send = () =>
      fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    let res = await send();
    // Under /api/auth/ so apiFetch's guard skips it — refresh-retry manually.
    if (res.status === 401 && (await tryRefresh())) res = await send();
    const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
    if (!res.ok) {
      return { user: null, error: data.error ?? "Something went wrong. Please try again." };
    }
    return { user: data.user ?? null, error: null };
  } catch {
    return { user: null, error: "Network error. Please try again." };
  }
}

/** Same email rule the server enforces — used for inline form validation. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export const PASSWORD_MIN_LENGTH = 6;

/** Full-page redirect into the Google OAuth flow. */
export function signInWithGoogle(): void {
  window.location.assign("/api/auth/google");
}

/** Full-page redirect into the GitHub OAuth flow. */
export function signInWithGitHub(): void {
  window.location.assign("/api/auth/github");
}

/** Human-friendly label for the signed-in user (name, phone, or email). */
export function userDisplayName(user: AuthUser): string {
  return user.name ?? user.phone ?? user.email ?? "Account";
}
