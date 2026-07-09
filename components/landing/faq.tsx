import { ChevronDownIcon } from "./icons";

const faqs = [
  {
    question: "Is my data safe with Aster?",
    answer:
      "Yes. Messages are encrypted in transit and at rest, access is scoped to exactly the accounts you connect, and your data is never used to train AI models. Disconnect an account and its data is deleted from our systems.",
  },
  {
    question: "Which platforms does Aster support?",
    answer:
      "Today: Gmail, Outlook, WhatsApp, and Telegram. Slack, iMessage, and Discord are on the roadmap — you can vote on what ships next from inside the app.",
  },
  {
    question: "Does Aster send messages on my behalf?",
    answer:
      "Only when you say so. Aster drafts replies and schedules invites, but nothing leaves your accounts without your explicit tap to send. You can also enable auto-send for specific, low-risk cases like calendar confirmations.",
  },
  {
    question: "How much does it cost?",
    answer:
      "Every plan starts with a free 14-day trial — no credit card required. After that, plans start at a simple monthly price per user, and you can cancel anytime with one click.",
  },
  {
    question: "Can I choose what Aster reads?",
    answer:
      "Absolutely. Mute specific chats, labels, folders, or senders, and Aster will skip them entirely. You control the scope per account, and you can change it whenever you like.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 py-20">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <p className="text-sm font-semibold text-violet-400">FAQ</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
            Questions, answered
          </h2>
        </div>

        <div className="mt-12 space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-2xl border border-white/5 bg-white/[0.03] transition-colors hover:border-white/10 open:border-white/10 open:bg-white/[0.05]"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5 text-sm font-medium text-white [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ChevronDownIcon className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-6 pb-5 text-sm leading-relaxed text-zinc-400">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
