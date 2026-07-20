"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ComputerIcon,
  Moon02Icon,
  Sun02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

type ThemePref = "light" | "dark" | "system";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun02Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
] as const;

function applyTheme(pref: ThemePref) {
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") setPref(saved);
  }, []);

  // In system mode, follow OS theme changes live.
  useEffect(() => {
    if (pref !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [pref]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(next: ThemePref) {
    setPref(next);
    setOpen(false);
    // No stored value means "follow the system" (same rule as the head script).
    if (next === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", next);
    applyTheme(next);
  }

  const current = OPTIONS.find((option) => option.value === pref) ?? OPTIONS[2];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Change theme"
        aria-label="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
      >
        <HugeiconsIcon icon={current.icon} size={18} strokeWidth={1.8} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-40 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg shadow-zinc-950/5 dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/40"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={pref === option.value}
              onClick={() => choose(option.value)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-white/5 ${
                pref === option.value
                  ? "font-medium text-zinc-900 dark:text-white"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              <HugeiconsIcon icon={option.icon} size={16} strokeWidth={1.8} />
              {option.label}
              {pref === option.value && (
                <HugeiconsIcon
                  icon={Tick02Icon}
                  size={16}
                  strokeWidth={2}
                  className="ml-auto text-violet-500"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
