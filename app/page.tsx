"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Landing page temporarily removed from this route — code preserved below.
// import Cta from "@/components/landing/cta";
// import Faq from "@/components/landing/faq";
// import Features from "@/components/landing/features";
// import Footer from "@/components/landing/footer";
// import Header from "@/components/landing/header";
// import Hero from "@/components/landing/hero";
// import HowItWorks from "@/components/landing/how-it-works";
// import Integrations from "@/components/landing/integrations";

/**
 * Everyone lands on the dashboard — first-time or signed-out visitors included.
 * The dashboard restores an existing session and, when there is none, shows its
 * own sign-in prompt instead of bouncing the visitor to /sign-in.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950">
      Checking your session…
    </div>
  );
}

// Original landing page — to restore, re-enable the imports above and make
// this the default export again.
/*
function LandingHome() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 font-sans text-zinc-100 selection:bg-violet-500/30">
      <Header />
      <main className="flex-1">
        <Hero />
        <Integrations />
        <Features />
        <HowItWorks />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
*/
