import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400 bg-clip-text text-6xl font-semibold tracking-tight text-transparent">
        404
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        This page could not be found.
      </p>
      <Link
        href="/dashboard"
        className="mt-3 rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
