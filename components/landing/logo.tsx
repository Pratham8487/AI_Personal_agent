import Image from "next/image";
import Link from "next/link";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      {/* Decorative: the adjacent "Aster" wordmark carries the name. */}
      <Image
        src="/logo.png"
        alt=""
        width={32}
        height={32}
        priority
        className="h-8 w-8 shrink-0 rounded-lg shadow-lg shadow-violet-500/25"
      />
      <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
        Aster
      </span>
    </Link>
  );
}
