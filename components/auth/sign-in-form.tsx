"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isValidEmail, signIn, signInWithGitHub, signInWithGoogle } from "@/lib/auth-client";
import AuthCard from "./auth-card";
import AuthDivider from "./auth-divider";
import FormError from "./form-error";
import GitHubButton from "./github-button";
import GoogleButton from "./google-button";
import SubmitButton from "./submit-button";
import TextField from "./text-field";

/** Friendly message for ?error= codes set by the OAuth callback redirects. */
function oauthCallbackError(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("error");
  if (!code) return null;
  if (code === "account_disabled") return "This account is disabled.";
  const provider = code.startsWith("github") ? "GitHub" : "Google";
  if (code.endsWith("_denied")) return `${provider} sign-in was cancelled.`;
  return `${provider} sign-in failed. Please try again.`;
}

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(oauthCallbackError);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Enter a valid email address, e.g. you@example.com.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setPending(true);
    const { user, error: signInError } = await signIn({ email, password });
    if (!user) {
      setError(signInError ?? "Unable to sign in. Please try again.");
      setPending(false);
      return;
    }
    router.replace("/");
  }

  function handleGoogle() {
    setError(null);
    signInWithGoogle(); // full-page redirect
  }

  function handleGitHub() {
    setError(null);
    signInWithGitHub(); // full-page redirect
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Aster account"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-zinc-900 transition-colors hover:text-zinc-600 dark:text-white dark:hover:text-zinc-300"
          >
            Sign up
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <GoogleButton onClick={handleGoogle} pending={pending} />
        <GitHubButton onClick={handleGitHub} pending={pending} />
      </div>
      <AuthDivider />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormError message={error} />
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Your password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className="-mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            Forgot password?
          </Link>
        </div>
        <SubmitButton pending={pending}>Sign in</SubmitButton>
      </form>
    </AuthCard>
  );
}
