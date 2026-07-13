"use client";

import { useSyncExternalStore } from "react";

const FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const emptySubscribe = () => () => {};

/** Formatted local date; null during SSR to avoid hydration mismatches. */
export function useToday(): string | null {
  return useSyncExternalStore(
    emptySubscribe,
    () => FORMAT.format(new Date()),
    () => null,
  );
}

/** Time-of-day greeting; null during SSR to avoid hydration mismatches. */
export function useGreeting(): string | null {
  return useSyncExternalStore(
    emptySubscribe,
    () => {
      const hour = new Date().getHours();
      if (hour < 12) return "Good Morning";
      if (hour < 17) return "Good Afternoon";
      return "Good Evening";
    },
    () => null,
  );
}
