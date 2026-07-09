import Link from "next/link";
import { SparklesIcon } from "./icons";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/25">
        <SparklesIcon className="h-4.5 w-4.5 text-white" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-white">
        Aster
      </span>
    </Link>
  );
}
