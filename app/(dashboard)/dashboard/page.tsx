import {
  Calendar03Icon,
  Clock01Icon,
  Mail01Icon,
  MessageMultiple01Icon,
} from "@hugeicons/core-free-icons";
import ActivityChart from "@/components/dashboard/activity-chart";
import Badge, { type BadgeTone } from "@/components/dashboard/badge";
import Card from "@/components/dashboard/card";
import PageHeader from "@/components/dashboard/page-header";
import StatCard from "@/components/dashboard/stat-card";

const stats = [
  { label: "Meetings today", value: "3", icon: Calendar03Icon, iconBg: "bg-indigo-500 shadow-indigo-500/40" },
  { label: "Important emails", value: "2", icon: Mail01Icon, iconBg: "bg-rose-500 shadow-rose-500/40" },
  { label: "Follow-ups pending", value: "4", icon: Clock01Icon, iconBg: "bg-amber-500 shadow-amber-500/40" },
  { label: "Priority messages", value: "7", icon: MessageMultiple01Icon, iconBg: "bg-violet-500 shadow-violet-500/40" },
];

const briefing: { source: string; text: string; tag: string; tone: BadgeTone }[] = [
  {
    source: "Gmail · Finance team",
    text: "Q3 budget approved. Priya needs your final headcount plan by Friday.",
    tag: "Action needed",
    tone: "amber",
  },
  {
    source: "WhatsApp · Family",
    text: "Trip group settled on Lisbon, Oct 12–16. Confirm the Airbnb by tonight.",
    tag: "FYI",
    tone: "zinc",
  },
  {
    source: "Slack · #engineering",
    text: "Daily standup moved to 10:30 AM starting tomorrow.",
    tag: "Update",
    tone: "indigo",
  },
];

const alerts: { text: string; time: string; tone: BadgeTone; severity: string }[] = [
  { text: "Pricing change mentioned in Acme email thread.", time: "2h ago", tone: "rose", severity: "High" },
  { text: "Invoice #482 due tomorrow — mentioned in Outlook.", time: "4h ago", tone: "amber", severity: "Medium" },
];

const suggestions: { text: string; action: string }[] = [
  { text: "Schedule meeting with Alex — tomorrow 11:00 AM.", action: "Confirm" },
  { text: "Reply to Sarah about the contract — due 3:00 PM.", action: "Draft" },
  { text: "Pay the electricity bill — due tomorrow.", action: "Remind me" },
];

const followUps: { text: string; waiting: string }[] = [
  { text: "Deck for Friday's review — promised to Alex.", waiting: "2 days" },
  { text: "Reply to vendor contract question.", waiting: "1 day" },
  { text: "Confirm dentist appointment — 2 PM slot.", waiting: "5 hours" },
  { text: "Send Mom the birthday plan draft.", waiting: "3 hours" },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Welcome back. Here's what's happening across your inboxes."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card
          title="Weekly activity"
          subtitle="Messages processed across your accounts"
          className="xl:col-span-2"
        >
          <ActivityChart />
        </Card>
        <Card title="Today's briefing" subtitle="Thursday, July 9">
          <ul className="space-y-4">
            {briefing.map((item) => (
              <li key={item.text} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.source}</p>
                  <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-200">{item.text}</p>
                </div>
                <Badge tone={item.tone}>{item.tag}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Important alerts" subtitle="Triggered by your alert rules">
          <ul className="space-y-4">
            {alerts.map((alert) => (
              <li key={alert.text} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">{alert.text}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{alert.time}</p>
                </div>
                <Badge tone={alert.tone}>{alert.severity}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="AI suggestions" subtitle="Actions Aster can take for you">
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={s.text} className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-200">{s.text}</p>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                >
                  {s.action}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Pending follow-ups" subtitle="Waiting on your response">
          <ul className="space-y-4">
            {followUps.map((f) => (
              <li key={f.text} className="flex items-start justify-between gap-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-200">{f.text}</p>
                <Badge tone="amber">{f.waiting}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
