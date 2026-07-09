"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { insforge } from "@/lib/insforge";
import AuthCard from "./auth-card";
import FormError from "./form-error";
import SubmitButton from "./submit-button";
import TextField from "./text-field";

async function postJson(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

export default function PhoneAuthForm({
  collectName = false,
  onBack,
}: {
  collectName?: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function requestCode() {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await postJson("/api/auth/phone/send-otp", { phone });
      setNotice("We texted you a 6-digit code.");
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    }
    setPending(false);
  }

  async function handleSendSubmit(event: React.FormEvent) {
    event.preventDefault();
    await requestCode();
  }

  async function handleVerifySubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const credentials = await postJson("/api/auth/phone/verify-otp", {
        phone,
        otp,
        name: collectName ? name : undefined,
      });
      const { error: signInError } = await insforge.auth.signInWithPassword(credentials);
      if (signInError) throw new Error(signInError.message);
      router.replace("/");
      return;
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      className="font-medium text-white transition-colors hover:text-zinc-300"
    >
      ← Other sign-in options
    </button>
  );

  if (step === "code") {
    return (
      <AuthCard
        title="Enter the code"
        subtitle={`We sent a 6-digit code by SMS to ${phone}.`}
        footer={backButton}
      >
        <form onSubmit={handleVerifySubmit} className="flex flex-col gap-4">
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
          <SubmitButton pending={pending}>Verify and continue</SubmitButton>
          <button
            type="button"
            onClick={requestCode}
            disabled={pending}
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-white disabled:opacity-60"
          >
            Didn&apos;t get the text? Resend code
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Continue with phone"
      subtitle="We'll text a verification code to your phone."
      footer={backButton}
    >
      <form onSubmit={handleSendSubmit} className="flex flex-col gap-4">
        <FormError message={error} />
        {collectName && (
          <TextField
            label="Name"
            type="text"
            name="name"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
        <TextField
          label="Phone number"
          type="tel"
          name="phone"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <p className="text-xs text-zinc-500">
          Include your country code, e.g. +91 for India.
        </p>
        <SubmitButton pending={pending}>Send code</SubmitButton>
      </form>
    </AuthCard>
  );
}
