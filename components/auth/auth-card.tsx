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
    <div className="bg-grid flex flex-1 flex-col items-center justify-center bg-zinc-950 px-6 py-12 font-sans text-zinc-100 selection:bg-violet-500/30">
      <Logo className="mb-8" />
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-400">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="mt-6 text-sm text-zinc-400">{footer}</p>}
    </div>
  );
}
