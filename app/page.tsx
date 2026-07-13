"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/use-current-user";

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
 * Auth gate: `getCurrentUser()` silently restores the session from the
 * httpOnly refresh cookie when one exists; otherwise the visitor is sent
 * to sign in.
 */
export default function Home() {
  const router = useRouter();
  const { user, isLoaded } = useCurrentUser();

  useEffect(() => {
    if (!isLoaded) return;
    router.replace(user ? "/dashboard" : "/sign-in");
  }, [isLoaded, user, router]);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-950 text-sm text-zinc-500">
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
