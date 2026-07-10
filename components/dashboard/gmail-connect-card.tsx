import Link from "next/link";
import Card from "./card";

const COPY = {
  "sign-in": {
    title: "Sign in to see your inbox",
    body: "Your Gmail data is loaded for your account only.",
    cta: "Sign in",
    href: "/sign-in",
  },
  connect: {
    title: "Connect Gmail",
    body: "Connect your Gmail account to see your real inbox here.",
    cta: "Go to integrations",
    href: "/integrations",
  },
} as const;

export default function GmailConnectCard({
  variant,
  className = "",
}: {
  variant: keyof typeof COPY;
  className?: string;
}) {
  const copy = COPY[variant];
  return (
    <Card className={`text-center ${className}`}>
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
        {copy.title}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {copy.body}
      </p>
      <Link
        href={copy.href}
        className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
      >
        {copy.cta}
      </Link>
    </Card>
  );
}
