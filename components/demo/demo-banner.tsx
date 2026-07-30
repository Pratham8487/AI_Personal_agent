"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { demoClose, demoHeartbeat, signOut } from "@/lib/auth-client";
import { useCurrentUser } from "@/lib/use-current-user";

/**
 * Comfortably shorter than the server's demo TTL, so a renewal never lapses
 * even when a backgrounded tab has its timers throttled.
 */
const HEARTBEAT_MS = 45_000;

/**
 * Sticky notice + lifecycle owner for a "Try Demo" session. Renders nothing for
 * real accounts, so mounting it in the dashboard layout is inert for everyone
 * else. While a demo session is open it:
 *   - heartbeats to renew the server-side TTL, and
 *   - fires a close beacon on tab-close so the throwaway user and all its data
 *     are reaped. A refresh re-mounts this effect and renews before the close
 *     grace elapses, so reloads are never deleted.
 */
export default function DemoBanner() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const isDemo = Boolean(user?.isDemo);

  useEffect(() => {
    if (!isDemo) return;

    demoHeartbeat();
    const timer = setInterval(demoHeartbeat, HEARTBEAT_MS);

    // pagehide (not visibilitychange) so merely switching tabs never triggers
    // cleanup — only an actual close/navigation away does.
    const onPageHide = () => demoClose();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [isDemo]);

  if (!isDemo) return null;

  async function handleExit() {
    demoClose();
    await signOut();
    router.replace("/sign-in");
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-800 dark:text-amber-200">
      <span className="font-medium">
        Demo session — your data is deleted when you close this tab.
      </span>
      <span className="flex items-center gap-3">
        <Link
          href="/sign-up"
          className="font-semibold text-amber-900 underline underline-offset-2 hover:opacity-80 dark:text-amber-100"
        >
          Sign up to save
        </Link>
        <Link
          href="/sign-in"
          className="font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Log in
        </Link>
        <button
          type="button"
          onClick={handleExit}
          className="font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Exit demo
        </button>
      </span>
    </div>
  );
}
