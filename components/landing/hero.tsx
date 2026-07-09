import Link from "next/link";
import {
  ArrowRightIcon,
  BellIcon,
  GmailIcon,
  OutlookIcon,
  SparklesIcon,
  TelegramIcon,
  WhatsAppIcon,
} from "./icons";

const digestItems = [
  {
    icon: <GmailIcon className="h-3.5 w-3.5 text-[#EA4335]" />,
    source: "Gmail · Finance team",
    title: "Q3 budget approved",
    summary:
      "Priya signed off on the revised numbers. She needs your final headcount plan by Friday.",
    tag: "Action needed",
    tagClass: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  },
  {
    icon: <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />,
    source: "WhatsApp · Family",
    title: "Saturday dinner moved",
    summary: "Dinner is now 8 PM at Nonna's. Your sister is picking up the cake.",
    tag: "FYI",
    tagClass: "bg-sky-400/10 text-sky-300 border-sky-400/20",
  },
  {
    icon: <OutlookIcon className="h-3.5 w-3.5 text-[#0078D4]" />,
    source: "Outlook · Acme Corp",
    title: "Client kickoff recap",
    summary: "Meeting notes summarized — 4 action items, 2 assigned to you.",
    tag: "Summarized",
    tagClass: "bg-violet-400/10 text-violet-300 border-violet-400/20",
  },
];

const reminders = [
  { text: "Reply to Sarah about the contract", when: "Today · 3:00 PM" },
  { text: "Pay the electricity bill", when: "Tomorrow" },
  { text: "Mom's birthday — draft a message?", when: "Jul 14" },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-36 pb-20 sm:pt-44">
      {/* Backdrop: grid + glow */}
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div className="absolute top-[-12rem] left-1/2 h-[26rem] w-[42rem] -translate-x-1/2 rounded-full bg-violet-600/25 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div
            className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-zinc-300"
            style={{ animationDelay: "0ms" }}
          >
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Now connecting Gmail, Outlook, WhatsApp &amp; Telegram
          </div>

          <h1
            className="animate-fade-up mt-6 text-4xl font-semibold tracking-tight text-balance text-white sm:text-6xl"
            style={{ animationDelay: "100ms" }}
          >
            Every inbox. One{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
              intelligent assistant
            </span>
            .
          </h1>

          <p
            className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg text-pretty text-zinc-400"
            style={{ animationDelay: "200ms" }}
          >
            Aster connects to your email and chat accounts, then turns the noise
            into crisp daily summaries, smart reminders, and instant answers —
            so nothing important slips past you again.
          </p>

          <div
            className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
            style={{ animationDelay: "300ms" }}
          >
            <Link
              href="#cta"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition-all hover:shadow-xl hover:shadow-violet-500/40 hover:brightness-110"
            >
              Get started free
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/10"
            >
              See how it works
            </Link>
          </div>

          <p
            className="animate-fade-up mt-5 text-xs text-zinc-500"
            style={{ animationDelay: "400ms" }}
          >
            Free 14-day trial · No credit card required · Disconnect anytime
          </p>
        </div>

        {/* Product mockup */}
        <div
          className="animate-fade-up relative mx-auto mt-16 max-w-4xl"
          style={{ animationDelay: "500ms" }}
        >
          <div className="absolute -inset-x-8 -top-8 -bottom-16 rounded-[2rem] bg-gradient-to-b from-violet-500/15 to-transparent blur-2xl" />

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/80 shadow-2xl shadow-black/50 backdrop-blur-sm">
            {/* Window chrome */}
            <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <span className="ml-4 rounded-md bg-white/5 px-3 py-1 text-[11px] text-zinc-500">
                aster.app/dashboard
              </span>
            </div>

            <div className="grid gap-px bg-white/5 md:grid-cols-[1.6fr_1fr]">
              {/* Digest column */}
              <div className="bg-zinc-900/90 p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Your morning digest
                  </h3>
                  <span className="text-[11px] text-zinc-500">
                    Thursday, July 9
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {digestItems.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-xl border border-white/5 bg-white/[0.03] p-3.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                          {item.icon}
                          {item.source}
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${item.tagClass}`}
                        >
                          {item.tag}
                        </span>
                      </div>
                      <p className="mt-2 text-[13px] font-medium text-zinc-100">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                        {item.summary}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reminders column */}
              <div className="flex flex-col bg-zinc-900/90 p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <BellIcon className="h-4 w-4 text-violet-400" />
                  <h3 className="text-sm font-semibold text-white">Reminders</h3>
                </div>
                <div className="mt-4 space-y-2.5">
                  {reminders.map((reminder) => (
                    <div
                      key={reminder.text}
                      className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] p-3"
                    >
                      <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-600" />
                      <div>
                        <p className="text-xs font-medium text-zinc-200">
                          {reminder.text}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {reminder.when}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-5">
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/60 px-3.5 py-2.5">
                    <span className="flex-1 text-xs text-zinc-500">
                      Ask Aster anything…
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500">
                      <SparklesIcon className="h-3 w-3 text-white" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating channel chips */}
          <div className="pointer-events-none absolute -top-5 -left-4 hidden rotate-[-6deg] items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 shadow-xl lg:flex">
            <TelegramIcon className="h-4 w-4 text-[#26A5E4]" />
            <span className="text-xs font-medium text-zinc-300">
              3 new messages summarized
            </span>
          </div>
          <div className="pointer-events-none absolute -right-6 -bottom-5 hidden rotate-[5deg] items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 shadow-xl lg:flex">
            <BellIcon className="h-4 w-4 text-amber-300" />
            <span className="text-xs font-medium text-zinc-300">
              Reminder set from chat
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
