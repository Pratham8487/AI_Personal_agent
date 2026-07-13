import { schedules, tasks } from "@trigger.dev/sdk";
import type { briefingGenerate } from "./briefing-generate";

/**
 * The ONLY Trigger.dev schedule: one cron tick every 15 minutes for all
 * users. It never runs generation itself — it asks the app which briefing
 * runs are due in the next window (the app claims them atomically in
 * Postgres) and enqueues one briefing-generate job per claimed run.
 * Requires env (Trigger.dev dashboard): APP_BASE_URL, INTERNAL_API_SECRET.
 */
export const briefingScheduler = schedules.task({
  id: "briefing-scheduler",
  cron: "*/15 * * * *",
  run: async () => {
    const res = await fetch(
      `${process.env.APP_BASE_URL}/api/briefings/claim-due`,
      {
        method: "POST",
        headers: {
          "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({ windowMinutes: 15 }),
      },
    );
    if (!res.ok) {
      throw new Error(`claim-due failed (${res.status})`);
    }
    const { runs } = (await res.json()) as {
      runs: { runId: string; scheduledFor: string }[];
    };
    if (!runs.length) return { enqueued: 0 };

    await tasks.batchTrigger<typeof briefingGenerate>(
      "briefing-generate",
      runs.map((run) => ({
        payload: { runId: run.runId },
        options: {
          // Dedup across scheduler retries/overlaps.
          idempotencyKey: run.runId,
          // Fire at the exact scheduled minute when the slot is still ahead.
          ...(Date.parse(run.scheduledFor) > Date.now()
            ? { delay: new Date(run.scheduledFor) }
            : {}),
        },
      })),
    );
    return { enqueued: runs.length };
  },
});
