const steps = [
  {
    number: "01",
    title: "Connect your accounts",
    description:
      "Link Gmail, Outlook, WhatsApp, and Telegram with secure OAuth in under two minutes. You choose exactly what Aster can see.",
  },
  {
    number: "02",
    title: "Aster organizes everything",
    description:
      "The assistant reads, prioritizes, and tags your messages continuously — spotting deadlines, commitments, and things that need you.",
  },
  {
    number: "03",
    title: "You stay effortlessly ahead",
    description:
      "Get a morning digest, timely reminders, and instant answers. Open one app instead of five, and only when it matters.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-violet-400">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
            Up and running before your coffee cools
          </h2>
        </div>

        <div className="relative mt-14 grid gap-8 md:grid-cols-3">
          <div className="absolute top-6 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-violet-500/40 via-fuchsia-500/40 to-violet-500/40 md:block" />
          {steps.map((step) => (
            <div key={step.number} className="relative text-center md:px-4">
              <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/30 bg-zinc-950 text-sm font-semibold text-violet-300 shadow-lg shadow-violet-500/10">
                {step.number}
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">
                {step.title}
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-zinc-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
