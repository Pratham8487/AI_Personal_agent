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

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [phoneMode, setPhoneMode] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const { data, error: signInError } = await insforge.auth.signInWithPassword(
      { email, password }
    );

    if (signInError || !data) {
      if (/verif/i.test(`${signInError?.error} ${signInError?.message}`)) {
        setNeedsVerification(true);
      } else {
        setError(signInError?.message ?? "Unable to sign in. Please try again.");
      }
      setPending(false);
      return;
    }

    const { error: syncError } = await syncUserToDatabase(data.user);
    if (syncError) console.error("Failed to sync user record:", syncError);
    router.replace("/");
  }

  async function handleGoogle() {
    setError(null);
    const oauthError = await signInWithGoogle();
    if (oauthError) setError(oauthError.message);
  }

  if (phoneMode) {
    return <PhoneAuthForm onBack={() => setPhoneMode(false)} />;
  }

  if (needsVerification) {
    return (
      <AuthCard
        title="Verify your email"
        subtitle={`Your email isn't verified yet. Enter the 6-digit code sent to ${email}.`}
      >
        <VerifyEmailForm email={email} />
      </AuthCard>
    );
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
            className="font-medium text-white transition-colors hover:text-zinc-300"
          >
            Sign up
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
        <SubmitButton pending={pending}>Sign in</SubmitButton>
      </form>
    </AuthCard>
  );
}
