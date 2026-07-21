import {
  MICROSOFT_RESOURCES,
  MicrosoftConsentRequiredError,
  MicrosoftNotEligibleError,
  REQUIRED_RESOURCES,
  buildIncrementalAuthUrl,
  ensureResourceToken,
  exchangeResourceCode,
  exchangeSignInCode,
  hasResourceToken,
  markIntegrationStatus,
  readVerifier,
  redirectClearingVerifier,
  redirectWithVerifier,
  verifyState,
  type MicrosoftResource,
} from "@/lib/server/microsoft-oauth";

const PROVIDER = "outlook";

/**
 * Microsoft redirects here after the user grants (or denies) access.
 *
 * The same route finishes both halves of the flow, told apart by the signed
 * `state`: the initial sign-in ("connect") that establishes the tenant, and
 * each incremental-consent hop for one Work IQ resource. After either, the
 * remaining resources are acquired off the shared refresh token, and the user
 * only sees another consent screen for a resource Entra says is missing one.
 */

function failure(request: Request, code: string) {
  return redirectClearingVerifier(
    new URL(`/integrations?int_error=${code}&provider=${PROVIDER}`, request.url)
      .toString(),
  );
}

function success(request: Request) {
  return redirectClearingVerifier(
    new URL(`/integrations?connected=${PROVIDER}`, request.url).toString(),
  );
}

/**
 * Walks the resources that still lack a token, redirecting into one more
 * consent screen when Entra asks for it.
 *
 * `justAttempted` is the resource this callback has already come back from —
 * if it *still* reports consent as missing, asking again would loop, so it is
 * treated as refused instead.
 */
async function acquireRemaining(
  userId: string,
  origin: string,
  justAttempted: MicrosoftResource | null,
): Promise<Response | null> {
  for (const resource of MICROSOFT_RESOURCES) {
    if (await hasResourceToken(userId, resource)) continue;

    try {
      await ensureResourceToken(userId, resource);
    } catch (error) {
      if (error instanceof MicrosoftNotEligibleError) throw error;

      if (
        error instanceof MicrosoftConsentRequiredError &&
        resource !== justAttempted
      ) {
        const next = await buildIncrementalAuthUrl(userId, origin, resource);
        if (next) return redirectWithVerifier(next.url, next.verifier);
      }

      // The universal Work IQ server only fills gaps in the Mail and Calendar
      // catalogs, so Outlook is still usable without it.
      if (!REQUIRED_RESOURCES.includes(resource)) {
        console.error(`Work IQ resource skipped (${resource}):`, error);
        continue;
      }
      throw error;
    }
  }
  return null;
}

/** Connected once both required resources have a token. */
async function requiredResourcesReady(userId: string): Promise<boolean> {
  for (const resource of REQUIRED_RESOURCES) {
    if (!(await hasResourceToken(userId, resource))) return false;
  }
  return true;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const state = verifyState(params.get("state") ?? "");
  if (!state) return failure(request, "invalid_state");
  const { userId, stage } = state;

  // A refusal on an optional resource still leaves a usable connection.
  if (params.get("error")) {
    if (stage !== "connect" && !REQUIRED_RESOURCES.includes(stage)) {
      return (await requiredResourcesReady(userId))
        ? success(request)
        : failure(request, "access_denied");
    }
    return failure(request, "access_denied");
  }

  const code = params.get("code");
  const verifier = readVerifier(request);
  if (!code || !verifier) return failure(request, "invalid_state");

  try {
    if (stage === "connect") {
      await exchangeSignInCode(userId, code, url.origin, verifier);
    } else {
      await exchangeResourceCode(userId, stage, code, url.origin, verifier);
    }

    const consent = await acquireRemaining(
      userId,
      url.origin,
      stage === "connect" ? null : stage,
    );
    if (consent) return consent;

    if (!(await requiredResourcesReady(userId))) {
      return failure(request, "exchange_failed");
    }
    await markIntegrationStatus(userId, PROVIDER, "connected");
    return success(request);
  } catch (error) {
    if (error instanceof MicrosoftNotEligibleError) {
      console.error("Outlook connect refused by Work IQ:", error.message);
      return failure(request, error.reason);
    }
    console.error("Outlook OAuth callback failed:", error);
    return failure(request, "exchange_failed");
  }
}
