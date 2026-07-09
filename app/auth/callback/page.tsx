"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { insforge } from "@/lib/insforge";
import { syncUserToDatabase } from "@/lib/auth";
import AuthCard from "@/components/auth/auth-card";
import FormError from "@/components/auth/form-error";

export default function AuthCallbackPage() {
  const router = useRouter();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      // getCurrentUser waits for the SDK to exchange the OAuth code in the URL.
      const { data, error: authError } = await insforge.auth.getCurrentUser();
      if (!data?.user) {
        setError(authError?.message ?? "Sign-in was not completed. Please try again.");
        return;
      }
      const { error: syncError } = await syncUserToDatabase(data.user);
      if (syncError) console.error("Failed to sync user record:", syncError);
      router.replace("/");
    })();
  }, [router]);

  return (
    <AuthCard
      title={error ? "Sign-in failed" : "Signing you in…"}
      subtitle={
        error
          ? "Something went wrong while completing your sign-in."
          : "Hang tight while we finish setting up your session."
      }
      footer={
        error && (
          <Link
            href="/sign-in"
            className="font-medium text-white transition-colors hover:text-zinc-300"
          >
            Back to sign in
          </Link>
        )
      }
    >
      {error ? (
        <FormError message={error} />
      ) : (
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          Completing sign-in
        </div>
      )}
    </AuthCard>
  );
}
