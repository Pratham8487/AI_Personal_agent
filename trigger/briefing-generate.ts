import { task } from "@trigger.dev/sdk";

/**
 * Thin HTTP worker for one claimed briefing run. All generation logic
 * (provider fetch, AI, persistence) lives in the Next.js app — this task
 * only calls the internal endpoint and interprets the status code.
 */
export const briefingGenerate = task({
  id: "briefing-generate",
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 30_000,
    maxTimeoutInMs: 120_000,
    factor: 2,
  },
  run: async ({ runId }: { runId: string }) => {
    const res = await fetch(`${process.env.APP_BASE_URL}/api/briefings/run`, {
      method: "POST",
      headers: {
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ runId }),
    });
    if (res.ok) {
      return (await res.json()) as { resultId: string };
    }
    // 409 = already succeeded, 410 = run/definition gone — nothing to retry.
    if (res.status === 409 || res.status === 410) {
      return { skipped: true, status: res.status };
    }
    throw new Error(`briefing run failed (${res.status})`);
  },
});
