import {
  GoogleNotConfiguredError,
  GoogleNotConnectedError,
  buildAuthUrl as buildGoogleAuthUrl,
  disconnectGoogleProvider,
  exchangeCode as exchangeGoogleCode,
  googleOauthConfigured,
  markIntegrationStatus,
  saveTokens as saveGoogleTokens,
  verifyState as verifyGoogleState,
} from "./google-oauth";

/**
 * Gmail-flavored view of the shared Google grant (see google-oauth.ts).
 * Kept as its own module so the Gmail routes, API client, and error handling
 * read the same as before the grant became multi-provider.
 */

export { getValidAccessToken, isUuid, redirectUri } from "./google-oauth";

/** Aliases: the Gmail routes catch these by name. */
export class GmailNotConfiguredError extends GoogleNotConfiguredError {
  constructor() {
    super();
    this.name = "GmailNotConfiguredError";
    this.message =
      "Gmail is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.";
  }
}

export class GmailNotConnectedError extends GoogleNotConnectedError {
  constructor() {
    super("Gmail is not connected. Connect it from the Integrations page.");
    this.name = "GmailNotConnectedError";
  }
}

export const gmailOauthConfigured = googleOauthConfigured;

export function buildAuthUrl(userId: string, origin: string): Promise<string> {
  return buildGoogleAuthUrl(userId, origin, "gmail");
}

export function verifyState(state: string): string | null {
  return verifyGoogleState(state, "gmail");
}

export function exchangeCode(code: string, origin: string) {
  return exchangeGoogleCode(code, origin, "gmail");
}

export function saveTokens(
  userId: string,
  tokens: Parameters<typeof saveGoogleTokens>[1],
): Promise<void> {
  return saveGoogleTokens(userId, tokens, "gmail");
}

export function markGmailStatus(
  userId: string,
  status: "connected" | "disconnected",
): Promise<void> {
  return markIntegrationStatus(userId, "gmail", status);
}

/** Drops Gmail; only revokes the shared grant if Calendar is off too. */
export function deleteTokens(userId: string): Promise<void> {
  return disconnectGoogleProvider(userId, "gmail");
}
