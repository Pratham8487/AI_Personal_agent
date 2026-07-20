"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  isValidEmail,
  PASSWORD_MIN_LENGTH,
  signInWithGoogle,
  signUp,
} from "@/lib/auth-client";
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
  const [phoneMode, setPhoneMode] = useState(false);
  const [verifyEmailFor, setVerifyEmailFor] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Enter a valid email address, e.g. you@example.com.");
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    setPending(true);
    const { user, error: signUpError } = await signUp({
      email,
      password,
      name: name.trim() || undefined,
    });

    if (!user) {
      setError(signUpError ?? "Unable to sign up. Please try again.");
      setPending(false);
      return;
    }
    // Signed in already (grace model); show the verify step before entering.
    setVerifyEmailFor(email);
    setPending(false);
  }

  function handleGoogle() {
    setError(null);
    signInWithGoogle(); // full-page redirect
  }

  if (phoneMode) {
    return <PhoneAuthForm collectName onBack={() => setPhoneMode(false)} />;
  }

  if (verifyEmailFor) {
    return (
      <AuthCard
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${verifyEmailFor}. Enter it below to verify your account.`}
      >
        <VerifyEmailForm email={verifyEmailFor} />
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
            className="font-medium text-zinc-900 transition-colors hover:text-zinc-600 dark:text-white dark:hover:text-zinc-300"
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
