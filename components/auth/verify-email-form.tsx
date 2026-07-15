"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resendVerification, verifyEmail } from "@/lib/auth-client";
import FormError from "./form-error";
import SubmitButton from "./submit-button";
import TextField from "./text-field";

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailForm({
  email,
  onDone,
}: {
  email: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  // The server is silent about resend rate limits (anti-enumeration), so the
  // client enforces the 60s window itself.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function finish() {
    if (onDone) onDone();
    else router.replace("/");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { user, error: verifyError } = await verifyEmail({ email, otp });
    if (!user) {
      setError(verifyError ?? "Verification failed. Please try again.");
      setPending(false);
      return;
    }
    finish();
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError(null);
    await resendVerification(email);
    setNotice("If that address is registered, we sent a new code.");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
      <SubmitButton pending={pending}>Verify email</SubmitButton>
      <button
        type="button"
        onClick={handleResend}
        disabled={pending || cooldown > 0}
        className="text-sm font-medium text-zinc-400 transition-colors hover:text-white disabled:opacity-60"
      >
        {cooldown > 0
          ? `Resend code in ${cooldown}s`
          : "Didn't get the email? Resend code"}
      </button>
      <button
        type="button"
        onClick={finish}
        className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-300"
      >
        Skip for now →
      </button>
    </form>
  );
}
