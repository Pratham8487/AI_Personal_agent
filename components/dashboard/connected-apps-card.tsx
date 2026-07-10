import Link from "next/link";
import Badge from "./badge";
import Card from "./card";
import { PROVIDERS, STATUS_CONNECTED } from "@/lib/integrations";
import type { IntegrationStatus } from "@/lib/use-integrations";

/** Top 4 apps, connected first, each with status and a Manage link. */
export default function ConnectedAppsCard({
  statuses,
  isLoading,
  className = "",
}: {
  statuses: Record<string, IntegrationStatus>;
  isLoading: boolean;
  className?: string;
}) {
  const connected = (id: string) => statuses[id]?.status === STATUS_CONNECTED;
  // Stable sort keeps the PROVIDERS order within each group.
  const top = [...PROVIDERS]
    .sort((a, b) => Number(connected(b.id)) - Number(connected(a.id)))
    .slice(0, 4);

  return (
    <Card
      title="Connected Apps"
      subtitle="Your linked accounts"
      className={className}
    >
      {isLoading ? (
        <div className="space-y-2">
          <div className="skeleton h-12 rounded-xl" />
          <div className="skeleton h-12 rounded-xl" />
          <div className="skeleton h-12 rounded-xl" />
          <div className="skeleton h-12 rounded-xl" />
        </div>
      ) : (
        <ul className="space-y-4">
          {top.map((provider) => (
            <li
              key={provider.id}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900">
                  <provider.Icon
                    className={`h-5 w-5 ${provider.brandClass}`}
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                    {provider.name}
                  </p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {provider.description}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge tone={connected(provider.id) ? "green" : "zinc"}>
                  {connected(provider.id) ? "Connected" : "Not connected"}
                </Badge>
                <Link
                  href="/integrations"
                  className="text-xs font-semibold text-violet-600 transition-colors hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
                >
                  Manage
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
