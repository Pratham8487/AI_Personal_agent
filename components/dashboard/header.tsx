import ThemeToggle from "./theme-toggle";

export default function DashboardHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-end border-b border-zinc-200/80 bg-white/60 px-6 backdrop-blur-xl dark:border-white/10 dark:bg-[#050308]/60">
      <ThemeToggle />
    </header>
  );
}
