import Badge, { type BadgeTone } from "@/components/dashboard/badge";
import Card from "@/components/dashboard/card";
import PageHeader from "@/components/dashboard/page-header";

const emails: { source: string; text: string; tag: string; tone: BadgeTone }[] = [
  {
    source: "Gmail · Finance team",
    text: "Q3 budget approved — final headcount plan due Friday.",
    tag: "Action needed",
    tone: "amber",
  },
  {
    source: "Outlook · Acme Corp",
    text: "Pricing change on your plan effective August 1.",
    tag: "Important",
    tone: "rose",
  },
];

const meetings = [
  { time: "9:30 AM", title: "Design sync with Priya", source: "Google Calendar" },
  { time: "1:00 PM", title: "1:1 with manager", source: "Outlook" },
  { time: "4:00 PM", title: "Q3 budget review", source: "Google Calendar" },
];

const followUps = [
  { text: "Send deck to Alex — promised for Friday.", status: "2 days waiting" },
  { text: "Reply to vendor contract question.", status: "1 day waiting" },
  { text: "Confirm Lisbon Airbnb with the trip group.", status: "Due tonight" },
  { text: "Call the dentist — 2 PM slot on hold.", status: "Due today" },
];

export default function BriefingPage() {
  return (
    <>
      <PageHeader
        title="Briefing"
        description="Your morning digest for Thursday, July 9."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Important emails" subtitle="2 need replies today">
          <ul className="space-y-4">
            {emails.map((email) => (
              <li key={email.text} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{email.source}</p>
                  <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-200">{email.text}</p>
                </div>
                <Badge tone={email.tone}>{email.tag}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Today's meetings" subtitle="3 on your calendar">
          <ul className="space-y-4">
            {meetings.map((meeting) => (
              <li key={meeting.title} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs font-semibold text-zinc-900 dark:text-white">
                  {meeting.time}
                </span>
                <div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">{meeting.title}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{meeting.source}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title="Pending follow-ups"
          subtitle="4 commitments Aster is tracking"
          className="xl:col-span-2"
        >
          <ul className="space-y-4">
            {followUps.map((f) => (
              <li key={f.text} className="flex items-start justify-between gap-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-200">{f.text}</p>
                <Badge tone="amber">{f.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
