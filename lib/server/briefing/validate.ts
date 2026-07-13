import {
  BRIEFING_CATEGORIES,
  BRIEFING_FREQUENCIES,
  type BriefingCategoryId,
  type BriefingDefinitionInput,
  type BriefingFrequency,
} from "@/lib/briefing-types";
import type { PriorityLevel } from "@/lib/dashboard-brief-types";
import { DASHBOARD_PROVIDERS } from "@/lib/server/dashboard/registry";

/** Only providers with live backend tools are selectable. */
const LIVE_APP_IDS: readonly string[] = DASHBOARD_PROVIDERS.map((p) => p.id);
const PRIORITIES: readonly string[] = ["low", "medium", "high"];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Validates an untrusted create/update body into a BriefingDefinitionInput.
 * Returns an error message string when the input is unusable.
 */
export function parseDefinitionInput(
  body: Record<string, unknown>,
): { input: BriefingDefinitionInput } | { error: string } {
  const name = cleanString(body.name, 80);
  if (!name) return { error: "A briefing name is required." };

  const apps = (Array.isArray(body.apps) ? body.apps : []).filter(
    (a): a is string => typeof a === "string" && LIVE_APP_IDS.includes(a),
  );

  const categories = (Array.isArray(body.categories) ? body.categories : []).filter(
    (c): c is BriefingCategoryId =>
      (BRIEFING_CATEGORIES as readonly string[]).includes(c as string),
  );
  if (categories.length === 0) {
    return { error: "Select at least one category." };
  }

  const priority = PRIORITIES.includes(body.priority as string)
    ? (body.priority as PriorityLevel)
    : null;
  if (!priority) return { error: "Invalid priority level." };

  const frequency = (BRIEFING_FREQUENCIES as readonly string[]).includes(
    body.frequency as string,
  )
    ? (body.frequency as BriefingFrequency)
    : null;
  if (!frequency) return { error: "Invalid frequency." };

  const scheduleTime = cleanString(body.scheduleTime, 5);
  if (frequency !== "once" && !TIME_PATTERN.test(scheduleTime)) {
    return { error: "Scheduled time must be HH:MM." };
  }

  const timezone = cleanString(body.timezone, 64);
  if (frequency !== "once" && !timezone) {
    return { error: "A timezone is required." };
  }

  const runAt = cleanString(body.runAt, 40);
  if (frequency === "once" && !runAt) {
    return { error: "A date and time is required for one-time briefings." };
  }

  return {
    input: {
      name,
      description: cleanString(body.description, 300),
      apps: [...new Set(apps)],
      categories: [...new Set(categories)],
      priority,
      frequency,
      scheduleTime: TIME_PATTERN.test(scheduleTime) ? scheduleTime : "08:00",
      timezone: timezone || "UTC",
      ...(frequency === "once" ? { runAt } : {}),
    },
  };
}
