export type ActivityDatum = { day: string; value: number };

export default function ActivityChart({ data }: { data: ActivityDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-40 items-end gap-3">
      {data.map((d, i) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {d.value}
          </span>
          <div
            className="chart-bar w-full max-w-10 rounded-t-lg bg-gradient-to-t from-violet-500 via-blue-500 to-cyan-400 shadow-lg shadow-violet-500/20"
            style={{
              height: `${(d.value / max) * 100}%`,
              animationDelay: `${i * 80}ms`,
            }}
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {d.day}
          </span>
        </div>
      ))}
    </div>
  );
}
