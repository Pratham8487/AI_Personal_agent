import {
  exchangeCode,
  markGmailStatus,
  saveTokens,
  verifyState,
} from "@/lib/server/gmail-oauth";

function redirectToIntegrations(request: Request, query: string) {
  return Response.redirect(new URL(`/integrations${query}`, request.url), 302);
}

/** Google redirects here after the user grants (or denies) Gmail access. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  if (params.get("error")) {
    return redirectToIntegrations(request, "?gmail_error=access_denied");
  }

  const code = params.get("code");
  const userId = verifyState(params.get("state") ?? "");
  if (!code || !userId) {
    return redirectToIntegrations(request, "?gmail_error=invalid_state");
  }

  try {
    const tokens = await exchangeCode(code, new URL(request.url).origin);
    await saveTokens(userId, tokens);
    await markGmailStatus(userId, "connected");
    return redirectToIntegrations(request, "?connected=gmail");
  } catch (error) {
    console.error("Gmail OAuth callback failed:", error);
    return redirectToIntegrations(request, "?gmail_error=exchange_failed");
  }
}
