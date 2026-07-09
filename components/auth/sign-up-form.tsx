"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { insforge } from "@/lib/insforge";
import { signInWithGoogle, syncUserToDatabase } from "@/lib/auth";
import AuthCard from "./auth-card";
import AuthDivider from "./auth-divider";
import FormError from "./form-error";
import GoogleButton from "./google-button";
import PhoneAuthForm from "./phone-auth-form";
import PhoneButton from "./phone-button";
import SubmitButton from "./submit-button";
import TextField from "./text-field";
import VerifyEmailForm from "./verify-email-form";

export default function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"details" | "verify">("details");
  const [phoneMode, setPhoneMode] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const { data, error: signUpError } = await insforge.auth.signUp({
      email,
      password,
      name: name.trim() || undefined,
    });

    if (signUpError || !data) {
      setError(signUpError?.message ?? "Unable to sign up. Please try again.");
      setPending(false);
      return;
    }

    if (data.requireEmailVerification) {
      setStep("verify");
      setPending(false);
      return;
    }

    // Email verification disabled: user is signed in right away.
    if (data.user) {
      const { error: syncError } = await syncUserToDatabase(data.user);
      if (syncError) console.error("Failed to sync user record:", syncError);
    }
    router.replace("/");
  }

  async function handleGoogle() {
    setError(null);
    const oauthError = await signInWithGoogle();
    if (oauthError) setError(oauthError.message);
  }

  if (phoneMode) {
    return <PhoneAuthForm collectName onBack={() => setPhoneMode(false)} />;
  }

  if (step === "verify") {
    return (
      <AuthCard
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${email}. Enter it below to verify your account.`}
      >
        <VerifyEmailForm email={email} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start your day with Aster in your corner"
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-white transition-colors hover:text-zinc-300"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <GoogleButton onClick={handleGoogle} pending={pending} />
        <PhoneButton onClick={() => setPhoneMode(true)} pending={pending} />
      </div>
      <AuthDivider />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormError message={error} />
        <TextField
          label="Name"
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
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
          autoComplete="new-password"
          placeholder="At least 6 characters"
          minLength={6}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <SubmitButton pending={pending}>Create account</SubmitButton>
      </form>
    </AuthCard>
  );
}
