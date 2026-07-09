import { HugeiconsIcon } from "@hugeicons/react";
import { SentIcon } from "@hugeicons/core-free-icons";
import Card from "@/components/dashboard/card";
import PageHeader from "@/components/dashboard/page-header";

const chips = [
  "Summarize my unread emails",
  "What needs my reply today?",
  "Draft a follow-up to the finance team",
  "Find risks in my inbox",
];

export default function AgentPage() {
  return (
    <>
      <PageHeader
        title="AI Agent"
        description="Ask anything across your connected accounts."
      />
      <Card className="flex min-h-[60vh] flex-col">
        <div className="flex-1 space-y-4">
          <div className="flex justify-end">
            <p className="max-w-md rounded-2xl rounded-br-sm bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2.5 text-sm text-white shadow-lg shadow-violet-500/25">
              What meetings do I have tomorrow?
            </p>
          </div>
          <div className="flex justify-start">
            <div className="max-w-md rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2.5 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-200">
              <p>You have 3 meetings tomorrow:</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>9:30 AM — Design sync with Priya (Google Calendar)</li>
                <li>11:00 AM — Intro call with Alex (suggested, unconfirmed)</li>
                <li>4:00 PM — Q3 budget review with the finance team</li>
              </ul>
              <p className="mt-2">
                Want me to confirm the 11:00 AM call with Alex?
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <p className="max-w-md rounded-2xl rounded-br-sm bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2.5 text-sm text-white shadow-lg shadow-violet-500/25">
              Yes, confirm it and draft a follow-up to the finance team.
            </p>
          </div>
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-3.5 dark:bg-white/5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="typing-dot h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 p-2 pl-4 dark:border-white/10">
          <input
            type="text"
            placeholder="Ask Aster anything..."
            className="flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-white dark:placeholder:text-zinc-500"
          />
          <button
            type="button"
            aria-label="Send message"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 text-white shadow-lg shadow-violet-500/25 transition-opacity hover:opacity-85"
          >
            <HugeiconsIcon icon={SentIcon} size={17} strokeWidth={1.8} />
          </button>
        </div>
      </Card>
    </>
  );
}
