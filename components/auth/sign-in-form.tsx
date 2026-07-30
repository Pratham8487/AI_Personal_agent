"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  isValidEmail,
  signIn,
  signInWithGitHub,
  signInWithGoogle,
  startDemo,
  verifyLoginOtp,
} from "@/lib/auth-client";
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

/** Mirrors OTP_RESEND_SECONDS on the server. */
const RESEND_COOLDOWN_SECONDS = 60;

export default function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "otp" | "demo">(
    "credentials",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(oauthCallbackError);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

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
    // A correct password only earns a mailed code — the session comes next.
    const { otpRequired, error: signInError } = await signIn({ email, password });
    setPending(false);
    if (!otpRequired) {
      setError(signInError ?? "Unable to sign in. Please try again.");
      return;
    }
    setStep("otp");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    const { user, error: verifyError } = await verifyLoginOtp({ email, otp });
    if (!user) {
      setError(verifyError ?? "Verification failed. Please try again.");
      setPending(false);
      return;
    }
    router.replace("/");
  }

  /** Re-runs the password leg, which mails a fresh code. */
  async function handleResend() {
    if (cooldown > 0 || pending) return;
    setError(null);
    setNotice(null);
    setPending(true);
    const { otpRequired, error: resendError } = await signIn({ email, password });
    setPending(false);
    if (!otpRequired) {
      setError(resendError ?? "Unable to resend the code. Please try again.");
      return;
    }
    setOtp("");
    setNotice("We sent a new code to your inbox.");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  function backToCredentials() {
    setStep("credentials");
    setOtp("");
    setPassword("");
    setName("");
    setError(null);
    setNotice(null);
    setCooldown(0);
  }

  function handleTryDemo() {
    setError(null);
    setNotice(null);
    setStep("demo");
  }

  /** Creates a throwaway demo account from just a name, then enters the app. */
  async function handleStartDemo(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { user, error: demoError } = await startDemo(name);
    if (!user) {
      setError(demoError ?? "Could not start the demo. Please try again.");
      setPending(false);
      return;
    }
    router.replace("/");
  }

  if (step === "otp") {
    return (
      <AuthCard title="Check your email" subtitle={`We sent a 6-digit code to ${email}`}>
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <FormError message={error} />
          {notice && (
            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
              {notice}
            </p>
          )}
          <TextField
            label="Sign-in code"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            required
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
          />
          <SubmitButton pending={pending}>Verify and sign in</SubmitButton>
          <button
            type="button"
            onClick={handleResend}
            disabled={pending || cooldown > 0}
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-white"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't get the email? Resend code"}
          </button>
          <button
            type="button"
            onClick={backToCredentials}
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← Use a different account
          </button>
        </form>
      </AuthCard>
    );
  }

  if (step === "demo") {
    return (
      <AuthCard
        title="Try Aster free"
        subtitle="No account needed — just tell us your name"
      >
        <form onSubmit={handleStartDemo} className="flex flex-col gap-4">
          <FormError message={error} />
          {/* Temporary-session warning: shown ONLY after choosing Try Demo. */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold">This is a temporary demo session.</p>
            <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
              Your chats, connected apps, and any data are deleted the moment
              you close this tab. Sign up anytime to keep your work.
            </p>
          </div>
          <TextField
            label="Your name"
            type="text"
            name="name"
            autoComplete="given-name"
            placeholder="Guest"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <SubmitButton pending={pending}>Start demo</SubmitButton>
          <button
            type="button"
            onClick={backToCredentials}
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← Back to sign in
          </button>
        </form>
      </AuthCard>
    );
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
        <button
          type="button"
          onClick={handleTryDemo}
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-400/30 dark:text-violet-200 dark:hover:bg-violet-400/15"
        >
          Try Demo — no sign-up needed
        </button>
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
