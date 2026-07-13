import DashboardHeader from "@/components/dashboard/header";
import Sidebar from "@/components/dashboard/sidebar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="bg-mesh relative flex flex-1 bg-zinc-50 text-zinc-900 dark:bg-[#050308] dark:text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="aurora-blob -top-40 -left-40 bg-violet-500/15 dark:bg-violet-600/15" />
        <div className="aurora-blob top-1/3 -right-48 bg-cyan-400/10 [animation-delay:-7s] dark:bg-cyan-500/10" />
        <div className="aurora-blob -bottom-48 left-1/3 bg-blue-500/10 [animation-delay:-13s] dark:bg-blue-600/10" />
      </div>
      <Sidebar />
      <div className="relative z-10 flex h-screen flex-1 flex-col">
        <DashboardHeader />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
