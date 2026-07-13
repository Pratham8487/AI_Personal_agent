import { AiNotConfiguredError, aiConfigured } from "@/lib/server/brief-ai";
import {
  BriefingNotFoundError,
  generateNow,
  getBriefingQuota,
  NoProviderDataError,
  RefreshLimitError,
} from "@/lib/server/briefing/service";
import { isUuid } from "@/lib/server/gmail-oauth";

/** Manual "Generate now" for one briefing. Body: { userId, briefingId }. */
export async function POST(request: Request) {
  let body: { userId?: string; briefingId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = body.userId ?? "";
  const briefingId = body.briefingId ?? "";
  if (!isUuid(userId) || !isUuid(briefingId)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }
  if (!aiConfigured()) {
    return Response.json(
      { error: new AiNotConfiguredError().message, code: "not_configured" },
      { status: 503 },
    );
  }

  try {
    const result = await generateNow(userId, briefingId);
    return Response.json({ result, refresh: await getBriefingQuota(userId) });
  } catch (error) {
    if (error instanceof RefreshLimitError) {
      const { quota } = error;
      return Response.json(
        {
          success: false,
          reason: "refresh_limit_reached",
          message: `You have used all ${quota.limit} briefing generations today.`,
          remainingRefreshes: quota.remaining,
          nextRefreshAt: quota.nextRefreshAt,
        },
        { status: 429 },
      );
    }
    if (error instanceof BriefingNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    const status = error instanceof NoProviderDataError ? 502 : 500;
    console.error("Briefings: generate failed:", error);
    return Response.json(
      { error: "Could not generate the briefing. Please retry." },
      { status },
    );
  }
}
