import Badge from "@/components/dashboard/badge";
import Card from "@/components/dashboard/card";
import PageHeader from "@/components/dashboard/page-header";

const preferences = [
  { label: "Daily briefing time", value: "8:00 AM" },
  { label: "Timezone", value: "Asia/Kolkata (GMT+5:30)" },
  { label: "Language", value: "English" },
];

const channels = [
  { name: "In-app", enabled: true },
  { name: "Email", enabled: true },
  { name: "Slack", enabled: true },
  { name: "WhatsApp", enabled: false },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your account and preferences."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Profile">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-semibold text-white">
              PS
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                Pratham Shah
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                pratham@example.com
              </p>
            </div>
          </div>
        </Card>
        <Card title="Preferences">
          <ul className="space-y-4">
            {preferences.map((pref) => (
              <li key={pref.label} className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-200">{pref.label}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{pref.value}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title="Delivery channels"
          subtitle="Where Aster sends briefings and alerts"
          className="xl:col-span-2"
        >
          <ul className="space-y-4">
            {channels.map((channel) => (
              <li key={channel.name} className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-200">{channel.name}</p>
                <Badge tone={channel.enabled ? "green" : "zinc"}>
                  {channel.enabled ? "On" : "Off"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
