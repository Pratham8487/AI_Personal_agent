import { PROVIDERS, type Provider } from "@/lib/integrations";

const byId = new Map<string, Provider>(PROVIDERS.map((p) => [p.id, p]));

/** Brand SVG for a provider id, in its brand color. */
export default function AppIcon({
  app,
  className = "h-4 w-4",
}: {
  app: string;
  className?: string;
}) {
  const provider = byId.get(app);
  if (!provider) return null;
  return <provider.Icon className={`${className} ${provider.brandClass}`} />;
}
