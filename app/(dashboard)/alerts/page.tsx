import Badge, { type BadgeTone } from "@/components/dashboard/badge";
import Card from "@/components/dashboard/card";
import PageHeader from "@/components/dashboard/page-header";

const recentAlerts: { text: string; source: string; time: string; severity: string; tone: BadgeTone }[] = [
  {
    text: "Pricing change mentioned in Acme email thread.",
    source: "Gmail",
    time: "2 hours ago",
    severity: "High",
    tone: "rose",
  },
  {
    text: "Invoice #482 due tomorrow.",
    source: "Outlook",
    time: "4 hours ago",
    severity: "Medium",
    tone: "amber",
  },
  {
    text: "Payment keyword detected in the trip group chat.",
    source: "WhatsApp",
    time: "Yesterday",
    severity: "Low",
    tone: "zinc",
  },
];

const rules = [
  { name: "Pricing or payment mentions", detail: "Email + chat, any sender", enabled: true },
  { name: "Urgent issues & deadlines", detail: "All connected apps", enabled: true },
  { name: "VIP sender: CEO", detail: "Instant notification", enabled: false },
];

export default function AlertsPage() {
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Aster alerts you when pricing, payment, or urgent issues appear."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Recent alerts" subtitle="Last 24 hours">
          <ul className="space-y-4">
            {recentAlerts.map((alert) => (
              <li key={alert.text} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">{alert.text}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {alert.source} · {alert.time}
                  </p>
                </div>
                <Badge tone={alert.tone}>{alert.severity}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Alert rules" subtitle="What Aster watches for">
          <ul className="space-y-4">
            {rules.map((rule) => (
              <li key={rule.name} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">{rule.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{rule.detail}</p>
                </div>
                <Badge tone={rule.enabled ? "green" : "zinc"}>
                  {rule.enabled ? "On" : "Off"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
