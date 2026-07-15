import type { Metadata } from "next";
import ForgotPasswordForm from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password — Aster",
  description: "Reset your Aster account password.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
