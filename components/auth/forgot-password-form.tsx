"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { forgotPassword, resetPassword } from "@/lib/auth-client";
import AuthCard from "./auth-card";
import FormError from "./form-error";
import SubmitButton from "./submit-button";
import TextField from "./text-field";

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordForm() {
  const [step, setStep] = useState<"email" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // The server answers 200 regardless (anti-enumeration), so the client
  // enforces the 60s resend window itself.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function requestCode() {
    setError(null);
    setPending(true);
    await forgotPassword(email);
    setNotice("If that address is registered, we emailed a 6-digit code.");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setStep("reset");
    setPending(false);
  }

  async function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    await requestCode();
  }

  async function handleResetSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    const { error: resetError } = await resetPassword({ email, otp, newPassword });
    if (resetError) {
      setError(resetError);
      setPending(false);
      return;
    }
    setStep("done");
    setPending(false);
  }

  const backToSignIn = (
    <Link
      href="/sign-in"
      className="font-medium text-white transition-colors hover:text-zinc-300"
    >
      ← Back to sign in
    </Link>
  );

  if (step === "done") {
    return (
      <AuthCard
        title="Password updated"
        subtitle="Your password has been changed and all devices were signed out."
        footer={backToSignIn}
      >
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-300">
          Sign in with your new password to continue.
        </p>
      </AuthCard>
    );
  }

  if (step === "reset") {
    return (
      <AuthCard
        title="Enter the code"
        subtitle={`If ${email} is registered, we emailed it a 6-digit code.`}
        footer={backToSignIn}
      >
        <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
          <FormError message={error} />
          {notice && (
            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-300">
              {notice}
            </p>
          )}
          <TextField
            label="Verification code"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            required
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            name="new-password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            minLength={6}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <SubmitButton pending={pending}>Reset password</SubmitButton>
          <button
            type="button"
            onClick={requestCode}
            disabled={pending || cooldown > 0}
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-white disabled:opacity-60"
          >
            {cooldown > 0
              ? `Resend code in ${cooldown}s`
              : "Didn't get the email? Resend code"}
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your account email and we'll send a reset code."
      footer={backToSignIn}
    >
      <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
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
        <SubmitButton pending={pending}>Send reset code</SubmitButton>
      </form>
    </AuthCard>
  );
}
