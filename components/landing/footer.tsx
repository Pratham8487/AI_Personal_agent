import Link from "next/link";
import Logo from "./logo";
import { GitHubIcon, LinkedInIcon, XSocialIcon } from "./icons";

const columns = [
  {
    heading: "Product",
    links: ["Features", "Integrations", "Pricing", "Changelog", "Roadmap"],
  },
  {
    heading: "Company",
    links: ["About", "Blog", "Careers", "Press", "Contact"],
  },
  {
    heading: "Resources",
    links: ["Help center", "API docs", "Community", "Status", "Guides"],
  },
  {
    heading: "Legal",
    links: ["Privacy", "Terms", "Security", "Cookies", "DPA"],
  },
];

const socials = [
  { label: "X (Twitter)", icon: <XSocialIcon className="h-4 w-4" /> },
  { label: "LinkedIn", icon: <LinkedInIcon className="h-4 w-4" /> },
  { label: "GitHub", icon: <GitHubIcon className="h-4 w-4" /> },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-400">
              The AI assistant that reads every inbox for you — and hands back
              your time.
            </p>
            <div className="mt-6 flex items-center gap-2">
              {socials.map((social) => (
                <Link
                  key={social.label}
                  href="#"
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition-colors hover:border-white/20 hover:text-white"
                >
                  {social.icon}
                </Link>
              ))}
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.heading}>
              <h3 className="text-sm font-semibold text-white">
                {column.heading}
              </h3>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link}>
                    <Link
                      href="#"
                      className="text-sm text-zinc-400 transition-colors hover:text-white"
                    >
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 sm:flex-row">
          <p className="text-xs text-zinc-500">
            © 2026 Aster Labs, Inc. All rights reserved.
          </p>
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            All systems operational
          </p>
        </div>
      </div>
    </footer>
  );
}
