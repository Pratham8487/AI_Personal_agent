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

export type EmailOtpPurpose = "EMAIL_VERIFICATION" | "PASSWORD_RESET" | "LOGIN";

type Copy = {
  subject: string;
  heading: string;
  intro: string;
  /** Purpose-specific "you didn't do this" line shown in the security notice. */
  notice: string;
};

const COPY: Record<EmailOtpPurpose, Copy> = {
  EMAIL_VERIFICATION: {
    subject: "Verify your email for Aster",
    heading: "Verify your email",
    intro: "Use this code to verify your email address:",
    notice:
      "If you didn't create an Aster account, you can safely ignore this email — no account will be activated.",
  },
  PASSWORD_RESET: {
    subject: "Reset your Aster password",
    heading: "Reset your password",
    intro: "Use this code to reset your password:",
    notice:
      "If you didn't request a password reset, ignore this email and your password will stay unchanged.",
  },
  LOGIN: {
    subject: "Your Aster sign-in code",
    heading: "Confirm it's you",
    intro: "Use this code to finish signing in to Aster:",
    notice:
      "If you didn't try to sign in, someone may know your password — change it as soon as you can.",
  },
};

/**
 * Renders the OTP email. Table-based with inline styles: the layout email
 * clients actually agree on. The <style> block only carries progressive
 * enhancements (dark mode, small-screen tweaks) that degrade to the inline
 * defaults wherever it gets stripped.
 */
function renderOtpEmail(otp: string, copy: Copy): string {
  // Grouped as 3+3 so the code stays readable when it wraps on narrow screens.
  const spaced = `${otp.slice(0, 3)}<span style="letter-spacing:0">&#8202;</span>${otp.slice(3)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${copy.subject}</title>
<style>
  @media (max-width:480px){
    .card{padding:28px 22px!important}
    .code{font-size:32px!important;letter-spacing:8px!important}
  }
  @media (prefers-color-scheme:dark){
    body,.bg{background:#09090b!important}
    .card{background:#18181b!important;border-color:#27272a!important}
    .brand,.heading,.code{color:#fafafa!important}
    .body-text{color:#a1a1aa!important}
    .code-well{background:#27272a!important;border-color:#3f3f46!important}
    .rule{border-color:#27272a!important}
    .muted{color:#71717a!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${copy.heading} — your code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.
</div>
<table class="bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <span class="brand" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#18181b;">Aster</span>
          </td>
        </tr>
        <tr>
          <td class="card" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <h1 class="heading" style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:#18181b;">${copy.heading}</h1>
            <p class="body-text" style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#52525b;">${copy.intro}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="code-well" align="center" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:22px 12px;">
                  <div class="code" style="font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:38px;line-height:1.1;font-weight:600;letter-spacing:10px;text-indent:10px;color:#18181b;">${spaced}</div>
                </td>
              </tr>
            </table>
            <p class="body-text" style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#52525b;text-align:center;">
              This code expires in <strong style="color:inherit;">${OTP_TTL_MINUTES} minutes</strong> and can be used once.
            </p>
            <hr class="rule" style="border:none;border-top:1px solid #e4e4e7;margin:28px 0 20px;">
            <p class="muted" style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">
              <strong style="color:inherit;">Security notice.</strong> Aster will never ask you for this code by email, phone, or chat. ${copy.notice}
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:22px;">
            <p class="muted" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#a1a1aa;">
              This is an automated message — please don't reply.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function renderOtpText(otp: string, copy: Copy): string {
  return [
    `${copy.heading}`,
    ``,
    `${copy.intro} ${otp}`,
    ``,
    `This code expires in ${OTP_TTL_MINUTES} minutes and can be used once.`,
    ``,
    `Security notice: Aster will never ask you for this code by email, phone, or chat.`,
    copy.notice,
  ].join("\n");
}

export async function sendOtpEmail(
  to: string,
  otp: string,
  purpose: EmailOtpPurpose
): Promise<void> {
  const copy = COPY[purpose];
  await getTransport().sendMail({
    from: `Aster <${SMTP_USER}>`,
    to,
    subject: copy.subject,
    text: renderOtpText(otp, copy),
    html: renderOtpEmail(otp, copy),
  });
}

export function sendPasswordResetEmail(to: string, otp: string): Promise<void> {
  return sendOtpEmail(to, otp, "PASSWORD_RESET");
}

/** Second factor for email+password sign-in. */
export function sendLoginOtpEmail(to: string, otp: string): Promise<void> {
  return sendOtpEmail(to, otp, "LOGIN");
}
