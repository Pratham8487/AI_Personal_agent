import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "./icons";

const assurances = [
  "Free 14-day trial",
  "No credit card required",
  "Cancel anytime",
];

export default function Cta() {
  return (
    <section id="cta" className="scroll-mt-24 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/20 via-zinc-900 to-fuchsia-600/10 px-6 py-16 text-center sm:px-16">
          <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_60%_80%_at_50%_50%,black,transparent)]" />
          <div className="absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-violet-500/30 blur-[100px]" />

          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
              Ready for a calmer inbox?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-zinc-400">
              Join thousands of busy people who let Aster read the noise so
              they can act on what matters.
            </p>

            <div className="mt-8 flex justify-center">
              <Link
                href="/sign-up"
                className="group inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-zinc-950 shadow-xl shadow-white/10 transition-all hover:bg-zinc-200"
              >
                Get started free
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {assurances.map((assurance) => (
                <span
                  key={assurance}
                  className="flex items-center gap-1.5 text-xs text-zinc-400"
                >
                  <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                  {assurance}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
