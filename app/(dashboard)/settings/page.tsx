"use client";

import Link from "next/link";
import Badge from "@/components/dashboard/badge";
import Card from "@/components/dashboard/card";
import PageHeader from "@/components/dashboard/page-header";
import Select from "@/components/dashboard/select";
import { userDisplayName } from "@/lib/auth";
import { useCurrentUser } from "@/lib/use-current-user";
import {
  useUserSettings,
  type DeliveryChannels,
  type UserSettings,
} from "@/lib/use-user-settings";

const BRIEFING_TIMES = ["06:00", "07:00", "08:00", "09:00", "10:00", "12:00", "18:00", "20:00"];

const LANGUAGES = ["English", "Hindi", "Gujarati", "Spanish"];

const CHANNEL_LABELS: { key: keyof DeliveryChannels; label: string }[] = [
  { key: "in_app", label: "In-app" },
  { key: "email", label: "Email" },
  { key: "slack", label: "Slack" },
  { key: "whatsapp", label: "WhatsApp" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "U";
}

function formatTime(time: string): string {
  const hour = Number(time.split(":")[0]);
  if (Number.isNaN(hour)) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-6 rounded-lg" />
      <div className="skeleton h-6 rounded-lg" />
      <div className="skeleton h-6 rounded-lg" />
    </div>
  );
}

function SignInHint() {
  return (
    <p className="text-sm text-zinc-500 dark:text-zinc-400">
      Sign in to manage this.
    </p>
  );
}

function PreferenceRows({
  settings,
  onUpdate,
}: {
  settings: UserSettings;
  onUpdate: (patch: Partial<UserSettings>) => void;
}) {
  return (
    <ul className="space-y-4">
      <li className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-700 dark:text-zinc-200">Daily briefing time</p>
        <Select
          ariaLabel="Daily briefing time"
          value={settings.briefing_time}
          onChange={(briefing_time) => onUpdate({ briefing_time })}
          options={BRIEFING_TIMES.map((time) => ({
            value: time,
            label: formatTime(time),
          }))}
        />
      </li>
      <li className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-700 dark:text-zinc-200">Timezone</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{settings.timezone}</p>
      </li>
      <li className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-700 dark:text-zinc-200">Language</p>
        <Select
          ariaLabel="Language"
          value={settings.language}
          onChange={(language) => onUpdate({ language })}
          options={LANGUAGES.map((language) => ({
            value: language,
            label: language,
          }))}
        />
      </li>
    </ul>
  );
}

export default function SettingsPage() {
  const { user, isLoaded } = useCurrentUser();
  const { settings, isLoading, loadError, isSaving, saveError, update } =
    useUserSettings(user?.id);

  const settingsBody = (content: React.ReactNode) => {
    if (!isLoaded || isLoading) return <SkeletonRows />;
    if (!user) return <SignInHint />;
    if (loadError || !settings) {
      return <p className="text-sm text-rose-500">{loadError ?? "Could not load your settings."}</p>;
    }
    return content;
  };

  const statusSubtitle = saveError ?? (isSaving ? "Saving…" : undefined);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your account and preferences."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Profile">
          {!isLoaded ? (
            <div className="flex items-center gap-4">
              <div className="skeleton h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-44 rounded" />
              </div>
            </div>
          ) : !user ? (
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Sign in to see your profile.
              </p>
              <Link
                href="/sign-in"
                className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-semibold text-white">
                {initials(userDisplayName(user))}
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {userDisplayName(user)}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {user.email}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Signed in with{" "}
                  {user.providers?.includes("google") ? "Google" : "email"}
                </p>
              </div>
            </div>
          )}
        </Card>
        <Card title="Preferences" subtitle={statusSubtitle}>
          {settingsBody(
            settings && <PreferenceRows settings={settings} onUpdate={update} />,
          )}
        </Card>
        <Card
          title="Delivery channels"
          subtitle={statusSubtitle ?? "Where Aster sends briefings and alerts"}
          className="xl:col-span-2"
        >
          {settingsBody(
            settings && (
              <ul className="space-y-4">
                {CHANNEL_LABELS.map(({ key, label }) => (
                  <li key={key} className="flex items-center justify-between gap-3">
                    <p className="text-sm text-zinc-700 dark:text-zinc-200">{label}</p>
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          channels: {
                            ...settings.channels,
                            [key]: !settings.channels[key],
                          },
                        })
                      }
                      aria-pressed={settings.channels[key]}
                      aria-label={`Turn ${label} ${settings.channels[key] ? "off" : "on"}`}
                    >
                      <Badge tone={settings.channels[key] ? "green" : "zinc"}>
                        {settings.channels[key] ? "On" : "Off"}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            ),
          )}
        </Card>
      </div>
    </>
  );
}
