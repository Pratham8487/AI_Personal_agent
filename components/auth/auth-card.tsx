import Logo from "@/components/landing/logo";

export default function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-grid flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-12 font-sans text-zinc-900 selection:bg-violet-500/30 dark:bg-zinc-950 dark:text-zinc-100">
      <Logo className="mb-8" />
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl shadow-zinc-950/5 backdrop-blur dark:border-white/10 dark:bg-white/[0.02] dark:shadow-2xl dark:shadow-black/40">
        <h1 className="text-center text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          {title}
        </h1>
        <p className="mt-1.5 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {subtitle}
        </p>
        <div className="mt-6">{children}</div>
      </div>
      {footer && (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">{footer}</p>
      )}
    </div>
  );
}
