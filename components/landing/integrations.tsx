import { GmailIcon, OutlookIcon, TelegramIcon, WhatsAppIcon } from "./icons";

const integrations = [
  {
    name: "Gmail",
    description: "Inbox summaries, priority detection & draft replies.",
    icon: <GmailIcon className="h-6 w-6 text-[#EA4335]" />,
  },
  {
    name: "Outlook",
    description: "Work email and calendar, digested every morning.",
    icon: <OutlookIcon className="h-6 w-6 text-[#0078D4]" />,
  },
  {
    name: "WhatsApp",
    description: "Group-chat recaps and commitments turned into reminders.",
    icon: <WhatsAppIcon className="h-6 w-6 text-[#25D366]" />,
  },
  {
    name: "Telegram",
    description: "Channels and DMs condensed into what actually matters.",
    icon: <TelegramIcon className="h-6 w-6 text-[#26A5E4]" />,
  },
];

export default function Integrations() {
  return (
    <section id="integrations" className="scroll-mt-24 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-sm font-medium tracking-wide text-zinc-500 uppercase">
          Connects with the tools you already use
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className="group flex items-start gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-5 transition-colors hover:border-white/10 hover:bg-white/[0.06]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-900">
                {integration.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">
                  {integration.name}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  {integration.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
