import type { ReactNode } from "react";
import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  GmailIcon,
  InboxIcon,
  OutlookIcon,
  PencilIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  TelegramIcon,
  WhatsAppIcon,
} from "./icons";

function BentoCard({
  className = "",
  icon,
  title,
  description,
  children,
}: {
  className?: string;
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-6 transition-all hover:border-white/10 hover:bg-white/[0.05] ${className}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 text-violet-400">
        {icon}
      </span>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
      {children}
    </div>
  );
}

export default function Features() {
  return (
    <section id="features" className="scroll-mt-24 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-violet-400">Features</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
            Everything your inbox does to you, undone.
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Aster reads across every account you connect and hands you back
            time, context, and peace of mind.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-6">
          {/* Daily digest — hero card */}
          <BentoCard
            className="md:col-span-4"
            icon={<SparklesIcon className="h-5 w-5" />}
            title="Wake up to a briefing, not a backlog"
            description="Every morning Aster distills overnight email and chats into one clean digest — grouped by importance, with the asks and deadlines pulled out for you."
          >
            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-white/5 bg-zinc-950/50 p-4">
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <GmailIcon className="h-3.5 w-3.5 text-[#EA4335]" />
                  Gmail · 14 unread
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                  2 need replies today: the vendor contract and Priya’s
                  headcount question. The rest is newsletters — archived.
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-zinc-950/50 p-4">
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />
                  WhatsApp · 47 messages
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                  Trip group settled on Lisbon, Oct 12–16. You owe Marco a yes
                  or no on the Airbnb by tonight.
                </p>
              </div>
            </div>
          </BentoCard>

          {/* Smart reminders */}
          <BentoCard
            className="md:col-span-2"
            icon={<BellIcon className="h-5 w-5" />}
            title="Never drop a promise"
            description="Aster spots commitments like “I'll send it Friday” inside your conversations and quietly turns them into reminders."
          >
            <div className="mt-5 space-y-2">
              {["Send deck to Alex — Fri", "Call the dentist — 2 PM"].map(
                (reminder) => (
                  <div
                    key={reminder}
                    className="flex items-center gap-2 rounded-lg border border-white/5 bg-zinc-950/50 px-3 py-2"
                  >
                    <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-xs text-zinc-300">{reminder}</span>
                  </div>
                ),
              )}
            </div>
          </BentoCard>

          {/* Ask anything */}
          <BentoCard
            className="md:col-span-3"
            icon={<SearchIcon className="h-5 w-5" />}
            title="Ask anything, across everything"
            description="One question searches every connected account. No more digging through four apps to find one attachment."
          >
            <div className="mt-5 space-y-2.5">
              <div className="ml-auto w-fit max-w-full rounded-2xl rounded-br-sm bg-violet-500/20 px-3.5 py-2 text-xs text-violet-100">
                When did Alex send the invoice?
              </div>
              <div className="w-fit max-w-full rounded-2xl rounded-bl-sm border border-white/5 bg-zinc-950/60 px-3.5 py-2 text-xs text-zinc-300">
                Tuesday at 4:12 PM, via Gmail — “Invoice #2041”. Due July 18.
                <span className="mt-1.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <GmailIcon className="h-3 w-3 text-[#EA4335]" /> Source: Gmail
                  thread
                </span>
              </div>
            </div>
          </BentoCard>

          {/* Unified inbox */}
          <BentoCard
            className="md:col-span-3"
            icon={<InboxIcon className="h-5 w-5" />}
            title="One timeline for every conversation"
            description="Email, group chats, and DMs merge into a single prioritized stream — so your attention goes where it's needed first."
          >
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {[
                {
                  icon: <GmailIcon className="h-3.5 w-3.5 text-[#EA4335]" />,
                  label: "Gmail",
                },
                {
                  icon: <OutlookIcon className="h-3.5 w-3.5 text-[#0078D4]" />,
                  label: "Outlook",
                },
                {
                  icon: <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />,
                  label: "WhatsApp",
                },
                {
                  icon: <TelegramIcon className="h-3.5 w-3.5 text-[#26A5E4]" />,
                  label: "Telegram",
                },
              ].map((channel) => (
                <span
                  key={channel.label}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-300"
                >
                  {channel.icon}
                  {channel.label}
                </span>
              ))}
              <span className="rounded-full border border-dashed border-white/15 px-3 py-1.5 text-xs text-zinc-500">
                + more coming
              </span>
            </div>
          </BentoCard>

          {/* Privacy */}
          <BentoCard
            className="md:col-span-2"
            icon={<ShieldIcon className="h-5 w-5" />}
            title="Private by design"
            description="Your messages are encrypted in transit and at rest, never used to train models, and deleted the moment you disconnect."
          />

          {/* Instant drafts */}
          <BentoCard
            className="md:col-span-2"
            icon={<PencilIcon className="h-5 w-5" />}
            title="Replies, drafted in your voice"
            description="Aster suggests responses that sound like you. Review, tweak if you like, and send in one tap."
          />

          {/* Calendar aware */}
          <BentoCard
            className="md:col-span-2"
            icon={<CalendarIcon className="h-5 w-5" />}
            title="Calendar-aware scheduling"
            description="“Can we meet Thursday?” gets answered with your real availability — and the invite goes out by itself."
          />
        </div>
      </div>
    </section>
  );
}
