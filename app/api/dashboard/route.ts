import { AiNotConfiguredError, aiConfigured } from "@/lib/server/brief-ai";
import {
  buildDashboard,
  NoProviderDataError,
  RefreshLimitError,
} from "@/lib/server/dashboard/service";
import { isUuid } from "@/lib/server/gmail-oauth";

const GENERIC_ERROR = "Could not load your dashboard. Please retry.";

/**
 * Aggregated dashboard for every connected provider. Body: { userId, force? }.
 * force bypasses the 2-hour server cache (the Refresh button).
 */
export async function POST(request: Request) {
  let body: { userId?: string; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = body.userId ?? "";
  if (!isUuid(userId)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }
  if (!aiConfigured()) {
    return Response.json(
      { error: new AiNotConfiguredError().message, code: "not_configured" },
      { status: 503 },
    );
  }

  try {
    const data = await buildDashboard(userId, body.force === true);
    return Response.json(data);
  } catch (error) {
    if (error instanceof RefreshLimitError) {
      const { quota } = error;
      return Response.json(
        {
          success: false,
          reason: "refresh_limit_reached",
          message: `You have used all ${quota.limit} dashboard refreshes today.`,
          remainingRefreshes: quota.remaining,
          nextRefreshAt: quota.nextRefreshAt,
        },
        { status: 429 },
      );
    }
    const status = error instanceof NoProviderDataError ? 502 : 500;
    console.error("Dashboard: request failed:", error);
    return Response.json({ error: GENERIC_ERROR }, { status });
  }
}
