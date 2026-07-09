import type { Metadata } from "next";
import SignInForm from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in — Aster",
  description: "Sign in to your Aster account.",
};

export default function SignInPage() {
  return <SignInForm />;
}
