import type { UserSchema } from "@insforge/sdk";
import { errorMessage } from "./error-message";
import { insforge } from "./insforge";

/** Synthetic email domain backing phone-authenticated InsForge accounts. */
export const PHONE_SHADOW_DOMAIN = "phone.aster.app";

/** Human-friendly label for the signed-in user (name, phone, or email). */
export function userDisplayName(user: UserSchema): string {
  if (user.profile?.name) return user.profile.name;
  if (user.email.endsWith(`@${PHONE_SHADOW_DOMAIN}`)) {
    return `+${user.email.slice(1).split("@")[0]}`;
  }
  return user.email;
}

/**
 * Upserts the signed-in user's record in the `users` table.
 * Called after every successful sign-in so the first one creates the row
 * and later ones keep it fresh, without ever duplicating records.
 */
export async function syncUserToDatabase(user: UserSchema) {
  // Phone users are synced server-side during OTP verification, and their
  // synthetic email must not overwrite the stored phone record.
  if (user.email.endsWith(`@${PHONE_SHADOW_DOMAIN}`)) return { error: null };

  const { data: existing, error: selectError } = await insforge.database
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) return { error: selectError };

  const record = {
    email: user.email,
    name: user.profile?.name ?? null,
    avatar_url: user.profile?.avatar_url ?? null,
    providers: user.providers ?? [],
    email_verified: user.emailVerified,
    verification_method: user.providers?.includes("google") ? "oauth" : "email",
    last_login_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await insforge.database
      .from("users")
      .update({ ...record, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    return { error };
  }

  const { error } = await insforge.database
    .from("users")
    .insert([{ id: user.id, ...record }]);
  return { error };
}

function isTimeoutError(error: unknown): boolean {
  return /timed?\s?out/i.test(errorMessage(error));
}

export async function signInWithGoogle() {
  const start = () =>
    insforge.auth.signInWithOAuth("google", {
      redirectTo: `${window.location.origin}/auth/callback`,
      additionalParams: { prompt: "select_account" },
    });

  const first = await start();
  if (!first.error) return null;
  if (!isTimeoutError(first.error)) return first.error;

  // The InsForge backend occasionally hangs on the first request after
  // idling; a retry on a fresh connection usually recovers.
  const second = await start();
  if (!second.error) return null;
  return isTimeoutError(second.error)
    ? { message: "Google sign-in is taking too long. Please try again." }
    : second.error;
}
