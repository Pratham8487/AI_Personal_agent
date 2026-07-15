"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Logout03Icon } from "@hugeicons/core-free-icons";
import { signOut } from "@/lib/auth-client";
import { useCurrentUser } from "@/lib/use-current-user";

export default function SignOutButton() {
  const { user } = useCurrentUser();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) return null;

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut();
    // Full navigation so every client hook drops its cached user state.
    window.location.assign("/sign-in");
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      title="Sign out"
      aria-label="Sign out"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
    >
      <HugeiconsIcon icon={Logout03Icon} size={18} strokeWidth={1.8} />
    </button>
  );
}
