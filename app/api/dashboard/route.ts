import { AiNotConfiguredError, aiConfigured } from "@/lib/server/brief-ai";
import {
  buildDashboard,
  NoProviderDataError,
  RefreshLimitError,
} from "@/lib/server/dashboard/service";
import { getSessionUser, unauthorized } from "@/lib/server/session";

const GENERIC_ERROR = "Could not load your dashboard. Please retry.";

/**
 * Aggregated dashboard for every connected provider. Body: { force? }.
 * force bypasses the 2-hour server cache (the Refresh button).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: { force?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!aiConfigured()) {
    return Response.json(
      { error: new AiNotConfiguredError().message, code: "not_configured" },
      { status: 503 },
    );
  }

  try {
    const data = await buildDashboard(user.id, body.force === true);
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
