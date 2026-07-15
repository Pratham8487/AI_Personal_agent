import { AiNotConfiguredError, aiConfigured } from "@/lib/server/brief-ai";
import {
  BriefingNotFoundError,
  generateNow,
  getBriefingQuota,
  NoProviderDataError,
  RefreshLimitError,
} from "@/lib/server/briefing/service";
import { isUuid } from "@/lib/server/gmail-oauth";
import { getSessionUser, unauthorized } from "@/lib/server/session";

/** Manual "Generate now" for one briefing. Body: { briefingId }. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: { briefingId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const briefingId = body.briefingId ?? "";
  if (!isUuid(briefingId)) {
    return Response.json({ error: "Invalid id." }, { status: 400 });
  }
  if (!aiConfigured()) {
    return Response.json(
      { error: new AiNotConfiguredError().message, code: "not_configured" },
      { status: 503 },
    );
  }

  try {
    const result = await generateNow(user.id, briefingId);
    return Response.json({ result, refresh: await getBriefingQuota(user.id) });
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
