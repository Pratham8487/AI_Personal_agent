import Badge from "@/components/dashboard/badge";
import Card from "@/components/dashboard/card";

const usage = [
  { label: "Connected apps", used: 4, limit: 6 },
  { label: "AI queries this month", used: 68, limit: 100 },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["2 connected apps", "20 AI queries per day", "Daily briefing"],
    current: true,
  },
  {
    name: "Pro",
    price: "$12",
    period: "per month",
    features: [
      "Unlimited connected apps",
      "Unlimited AI queries",
      "Custom alert rules",
      "Priority support",
    ],
    current: false,
  },
];

// Plan, billing, and usage cards — rendered inside the settings page grid
// (xl:grid-cols-2), so the usage card spans both columns.
export default function PricingSettings() {
  return (
    <>
      <Card
        title="Current plan"
        subtitle="Free trial · 9 days left"
        action={<Badge tone="indigo">Trial</Badge>}
        className="xl:col-span-2"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {usage.map((u) => (
            <div key={u.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">{u.label}</span>
                <span className="font-medium text-zinc-900 dark:text-white">
                  {u.used} / {u.limit}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400"
                  style={{ width: `${(u.used / u.limit) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
      {plans.map((plan) => (
        <Card key={plan.name} hover>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
              {plan.name}
            </p>
            {plan.current && <Badge tone="green">Current plan</Badge>}
          </div>
          <p className="mt-2">
            <span className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
              {plan.price}
            </span>
            <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
              {plan.period}
            </span>
          </p>
          <ul className="mt-4 space-y-2">
            {plan.features.map((feature) => (
              <li
                key={feature}
                className="text-sm text-zinc-700 dark:text-zinc-200"
              >
                {feature}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`mt-5 w-full rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              plan.current
                ? "border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                : "bg-gradient-to-r from-violet-500 to-blue-500 text-white shadow-lg shadow-violet-500/25 hover:opacity-85"
            }`}
          >
            {plan.current ? "Manage plan" : "Upgrade to Pro"}
          </button>
        </Card>
      ))}
    </>
  );
}
