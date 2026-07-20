"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Logout03Icon,
  SidebarLeft01Icon,
  SidebarRight01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { signOut } from "@/lib/auth-client";
import { useCurrentUser } from "@/lib/use-current-user";
import { mainNavItems, type NavItem } from "./nav-items";

function Tooltip({
  label,
  description,
}: {
  label: string;
  description?: string;
}) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 w-max max-w-52 -translate-y-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 dark:border-white/10 dark:bg-[#17111f]">
      <span className="block text-xs font-semibold text-zinc-900 dark:text-white">
        {label}
      </span>
      {description && (
        <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
          {description}
        </span>
      )}
    </span>
  );
}

function NavLink({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-3 rounded-xl p-2 text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-gradient-to-r from-violet-500/15 to-cyan-500/5 text-zinc-900 ring-1 ring-violet-500/20 ring-inset dark:from-violet-500/20 dark:to-cyan-500/10 dark:text-white dark:ring-violet-400/20"
          : "text-zinc-500 hover:translate-x-0.5 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
      } ${collapsed ? "justify-center" : ""}`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.iconBg}`}
      >
        <HugeiconsIcon
          icon={item.icon}
          size={17}
          strokeWidth={1.8}
          className="text-white"
        />
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && (
        <Tooltip label={item.label} description={item.description} />
      )}
    </Link>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const isActive = (item: NavItem) =>
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <aside
      className={`sticky top-0 z-20 flex h-screen shrink-0 flex-col border-r border-zinc-200/80 bg-white/70 backdrop-blur-xl transition-[width] duration-300 dark:border-white/10 dark:bg-[#0c0812]/60 ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      <div
        className={`flex border-b border-zinc-200 dark:border-white/10 ${
          collapsed
            ? "flex-col items-center gap-2 py-3"
            : "h-16 items-center gap-2.5 px-4"
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/25">
          <HugeiconsIcon icon={SparklesIcon} size={18} className="text-white" />
        </span>
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
            Aster
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`group relative flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white ${
            collapsed ? "" : "ml-auto"
          }`}
        >
          <HugeiconsIcon
            icon={collapsed ? SidebarRight01Icon : SidebarLeft01Icon}
            size={17}
            strokeWidth={1.8}
          />
          <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} />
        </button>
      </div>

      <nav
        className={`flex-1 space-y-1 p-3 ${collapsed ? "" : "overflow-y-auto"}`}
      >
        {mainNavItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={isActive(item)}
          />
        ))}
      </nav>

      <SignOutItem collapsed={collapsed} />
    </aside>
  );
}

function SignOutItem({ collapsed }: { collapsed: boolean }) {
  const { user } = useCurrentUser();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) return null;

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut();
    // Full navigation so every client hook drops its cached user state.
    window.location.assign("/sign-in");
  }

  return (
    <div className="border-t border-zinc-200 p-3 dark:border-white/10">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className={`group relative flex w-full items-center gap-3 rounded-xl p-2 text-sm font-medium text-zinc-500 transition-all duration-200 hover:translate-x-0.5 hover:bg-rose-100 hover:text-rose-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-rose-500/15 dark:hover:text-rose-300 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500 shadow-lg shadow-rose-500/30">
          <HugeiconsIcon
            icon={Logout03Icon}
            size={17}
            strokeWidth={1.8}
            className="text-white"
          />
        </span>
        {!collapsed && (
          <span className="truncate">
            {isSigningOut ? "Signing out…" : "Sign out"}
          </span>
        )}
        {collapsed && (
          <Tooltip label="Sign out" description="Sign out of your account" />
        )}
      </button>
    </div>
  );
}
