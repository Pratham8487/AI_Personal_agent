import {
  exchangeCode,
  markIntegrationStatus,
  saveTokens,
  verifyState,
} from "@/lib/server/google-oauth";

const PROVIDER = "google-calendar";

function redirectToIntegrations(request: Request, query: string) {
  return Response.redirect(new URL(`/integrations${query}`, request.url), 302);
}

function failure(request: Request, code: string) {
  return redirectToIntegrations(
    request,
    `?int_error=${code}&provider=${PROVIDER}`,
  );
}

/** Google redirects here after the user grants (or denies) Calendar access. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  if (params.get("error")) {
    return failure(request, "access_denied");
  }

  const code = params.get("code");
  const userId = verifyState(params.get("state") ?? "", PROVIDER);
  if (!code || !userId) {
    return failure(request, "invalid_state");
  }

  try {
    const origin = new URL(request.url).origin;
    const tokens = await exchangeCode(code, origin, PROVIDER);
    await saveTokens(userId, tokens, PROVIDER);
    await markIntegrationStatus(userId, PROVIDER, "connected");
    return redirectToIntegrations(request, `?connected=${PROVIDER}`);
  } catch (error) {
    console.error("Google Calendar OAuth callback failed:", error);
    return failure(request, "exchange_failed");
  }
}
