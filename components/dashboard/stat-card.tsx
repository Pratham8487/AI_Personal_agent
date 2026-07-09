import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

export default function StatCard({
  label,
  value,
  icon,
  iconBg,
}: {
  label: string;
  value: string;
  icon: IconSvgElement;
  iconBg: string;
}) {
  return (
    <div className="glass-card glass-hover flex items-center gap-4 p-6">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-lg ${iconBg}`}
      >
        <HugeiconsIcon
          icon={icon}
          size={20}
          strokeWidth={1.8}
          className="text-white"
        />
      </span>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
      </div>
    </div>
  );
}
