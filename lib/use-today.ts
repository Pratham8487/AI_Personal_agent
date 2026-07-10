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
