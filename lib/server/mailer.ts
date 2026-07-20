import nodemailer, { type Transporter } from "nodemailer";
import { OTP_TTL_MINUTES } from "./otp";

const SMTP_USER = process.env.GMAIL_SMTP_USER;
const SMTP_PASSWORD = process.env.GMAIL_SMTP_APP_PASSWORD;

export function mailerConfigured(): boolean {
  return Boolean(SMTP_USER && SMTP_PASSWORD);
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (!mailerConfigured()) {
    throw new Error(
      "Email is not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD in .env.local"
    );
  }
  transport ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  return transport;
}

export type EmailOtpPurpose = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

const COPY: Record<EmailOtpPurpose, { subject: string; intro: string }> = {
  EMAIL_VERIFICATION: {
    subject: "Verify your email for Aster",
    intro: "Use this code to verify your email address:",
  },
  PASSWORD_RESET: {
    subject: "Reset your Aster password",
    intro: "Use this code to reset your password:",
  },
};

export async function sendOtpEmail(
  to: string,
  otp: string,
  purpose: EmailOtpPurpose
): Promise<void> {
  const { subject, intro } = COPY[purpose];
  await getTransport().sendMail({
    from: `Aster <${SMTP_USER}>`,
    to,
    subject,
    text: `${intro} ${otp}\n\nThis code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request it, you can ignore this email.`,
  });
}

export function sendPasswordResetEmail(to: string, otp: string): Promise<void> {
  return sendOtpEmail(to, otp, "PASSWORD_RESET");
}
