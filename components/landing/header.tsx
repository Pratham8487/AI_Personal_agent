"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";
import { signOut, userDisplayName } from "@/lib/auth-client";
import { useCurrentUser } from "@/lib/use-current-user";
import Logo from "./logo";
import { MenuIcon, XIcon } from "./icons";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#integrations", label: "Integrations" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, setUser } = useCurrentUser();

  async function handleSignOut() {
    await signOut();
    setUser(null);
    setMenuOpen(false);
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-zinc-950/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <Link
                href="/dashboard"
                title="Dashboard"
                aria-label="Dashboard"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition-opacity hover:opacity-85"
              >
                <HugeiconsIcon icon={DashboardSquare01Icon} size={18} strokeWidth={1.8} />
              </Link>
              <span className="text-sm font-medium text-zinc-300">
                {userDisplayName(user)}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 shadow-lg shadow-white/10 transition-all hover:bg-zinc-200"
              >
                Get started
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="rounded-lg p-2 text-zinc-300 transition-colors hover:bg-white/5 hover:text-white md:hidden"
        >
          {menuOpen ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </nav>

      {menuOpen && (
        <div className="border-t border-white/5 bg-zinc-950/95 px-6 py-4 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-4">
              {user ? (
                <>
                  <span className="px-3 py-1 text-center text-sm font-medium text-zinc-300">
                    {userDisplayName(user)}
                  </span>
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-85"
                  >
                    <HugeiconsIcon
                      icon={DashboardSquare01Icon}
                      size={17}
                      strokeWidth={1.8}
                    />
                    Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-lg border border-white/10 px-4 py-2.5 text-center text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/sign-in"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg border border-white/10 px-4 py-2.5 text-center text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/sign-up"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg bg-white px-4 py-2.5 text-center text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                  >
                    Get started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
