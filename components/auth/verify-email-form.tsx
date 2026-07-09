"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { insforge } from "@/lib/insforge";
import { syncUserToDatabase } from "@/lib/auth";
import TextField from "./text-field";
import SubmitButton from "./submit-button";
import FormError from "./form-error";

export default function VerifyEmailForm({ email }: { email: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const { data, error: verifyError } = await insforge.auth.verifyEmail({
      email,
      otp: otp.trim(),
    });

    if (verifyError || !data) {
      setError(verifyError?.message ?? "Verification failed. Please try again.");
      setPending(false);
      return;
    }

    const { data: current } = await insforge.auth.getCurrentUser();
    if (current?.user) {
      const { error: syncError } = await syncUserToDatabase(current.user);
      if (syncError) console.error("Failed to sync user record:", syncError);
    }
    router.replace("/");
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    const { error: resendError } = await insforge.auth.resendVerificationEmail({
      email,
    });
    if (resendError) {
      setError(resendError.message);
    } else {
      setNotice("A new code is on its way to your inbox.");
    }
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
        className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
      >
        Didn&apos;t get the code? Resend it
      </button>
    </form>
  );
}
