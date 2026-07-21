import {
  McpTransportError,
  initializeSession,
  postJsonRpc,
  type JsonRpcResponse,
  type McpToolDefinition,
} from "./mcp-http";
import {
  MICROSOFT_RESOURCES,
  MicrosoftNotConnectedError,
  MicrosoftNotEligibleError,
  RESOURCE_LABELS,
  getGrant,
  getResourceToken,
  mcpEndpoint,
  type MicrosoftResource,
} from "./microsoft-oauth";

/**
 * Client for Microsoft's official Work IQ MCP servers, which together make up
 * the Outlook integration:
 *
 *   mcp_MailTools      agent365.svc.cloud.microsoft/.../servers/mcp_MailTools
 *   mcp_CalendarTools  agent365.svc.cloud.microsoft/.../servers/mcp_CalendarTools
 *   Work IQ            workiq.svc.cloud.microsoft/mcp
 *
 *   transport  JSON-RPC 2.0 over streamable HTTP
 *   auth       Authorization: Bearer <Entra access token for that resource>
 *
 * The catalog is always the union of what those three servers return from
 * tools/list — tool names, descriptions and JSON Schemas are Microsoft's own
 * and are never hardcoded here. The Mail and Calendar servers carry the named
 * Outlook tools; the universal Work IQ server contributes path-based tools
 * (fetch, do_action, …) that reach the Graph resources the other two do not
 * expose, such as mail folders, attachments, forwarding and calendar lists.
 *
 * Unlike Google Calendar there is no REST fallback: an account Microsoft will
 * not serve is reported as ineligible rather than quietly served by a
 * hand-rolled Graph wrapper.
 *
 * Requires an Entra app with delegated Tools.ListInvoke.All on the Work IQ
 * Mail and Calendar MCP APIs and WorkIQAgent.Ask on Work IQ, admin-consented
 * in the user's tenant, and a Microsoft 365 Copilot license on the account.
 */

export class OutlookMcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutlookMcpError";
  }
}

export type OutlookToolResult = {
  text: string;
  structured?: Record<string, unknown>;
};

/** Which of the three servers a tool came from, for the Settings grouping. */
export type OutlookToolDefinition = McpToolDefinition & {
  resource: MicrosoftResource;
};

const CATALOG_TTL_MS = 60 * 60 * 1000;

/**
 * Both caches are bounded so a long-lived process cannot accumulate an entry
 * per tenant or per user forever.
 */
const MAX_TRACKED = 500;

function remember<T>(cache: Map<string, T>, key: string, value: T): void {
  // Map preserves insertion order, so the first key is the oldest.
  if (!cache.has(key) && cache.size >= MAX_TRACKED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

type Catalog = {
  tools: OutlookToolDefinition[];
  routes: Map<string, MicrosoftResource>;
  fetchedAt: number;
};

/**
 * Keyed by tenant, not by user: the catalog is a property of the tenant's
 * Work IQ configuration, and one user's fetch serves their colleagues too.
 */
const catalogs = new Map<string, Catalog>();
const inFlight = new Map<string, Promise<Catalog>>();

/** MCP session ids, keyed "<userId>:<resource>". */
const sessions = new Map<string, string>();

// --- eligibility ------------------------------------------------------------

const LICENSE_PATTERN =
  /copilot license|not licensed|license (?:is )?required|requires a .*license/i;
const DISABLED_PATTERN =
  /work ?iq is not enabled|not enabled for (?:this|your) tenant|not provisioned/i;
const CONSENT_PATTERN = /admin consent|has not consented|AADSTS65001/i;

/**
 * Work IQ reports "you may not use this at all" as an ordinary error string.
 * Recognizing it lets the UI explain the requirement instead of offering a
 * retry that can never succeed.
 */
function asEligibilityError(message: string): MicrosoftNotEligibleError | null {
  if (LICENSE_PATTERN.test(message)) {
    return new MicrosoftNotEligibleError(
      "copilot_license_required",
      "This account needs a Microsoft 365 Copilot license to use Microsoft's Work IQ MCP servers.",
    );
  }
  if (DISABLED_PATTERN.test(message)) {
    return new MicrosoftNotEligibleError(
      "work_iq_disabled",
      "Work IQ is not enabled in this Microsoft 365 tenant. An administrator has to turn it on.",
    );
  }
  if (CONSENT_PATTERN.test(message)) {
    return new MicrosoftNotEligibleError(
      "admin_consent_required",
      "A Microsoft 365 administrator has to grant this app consent before Outlook can connect.",
    );
  }
  return null;
}

// --- transport --------------------------------------------------------------

/**
 * Posts one message to a resource's server, establishing an MCP session first
 * and re-establishing it once if the server reports the session as gone.
 */
async function callServer(
  userId: string,
  resource: MicrosoftResource,
  tenantId: string,
  message: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  const endpoint = mcpEndpoint(resource, tenantId);
  const label = RESOURCE_LABELS[resource];
  const accessToken = await getResourceToken(userId, resource);
  const sessionKey = `${userId}:${resource}`;

  const options = {
    endpoint,
    accessToken,
    label,
    onUnauthorized: () =>
      new MicrosoftNotConnectedError(
        `${label} access has expired. Reconnect Outlook from the Integrations page.`,
      ),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let sessionId = sessions.get(sessionKey) ?? null;
    if (!sessionId) {
      sessionId = await initializeSession(options);
      if (sessionId) remember(sessions, sessionKey, sessionId);
    }

    const result = await postJsonRpc({ ...options, message, sessionId });
    if (!result.sessionExpired) {
      if (result.sessionId) remember(sessions, sessionKey, result.sessionId);
      return result.response;
    }
    sessions.delete(sessionKey);
  }
  throw new OutlookMcpError(`${label} ended the session. Please retry.`);
}

// --- catalog ----------------------------------------------------------------

async function fetchServerTools(
  userId: string,
  resource: MicrosoftResource,
  tenantId: string,
): Promise<OutlookToolDefinition[]> {
  const response = await callServer(userId, resource, tenantId, {
    method: "tools/list",
  });
  if (response.error || !response.result?.tools) {
    const message = response.error?.message ?? "";
    const ineligible = asEligibilityError(message);
    if (ineligible) throw ineligible;
    throw new OutlookMcpError(
      message || `Could not load ${RESOURCE_LABELS[resource]} tools.`,
    );
  }
  return response.result.tools.map((tool) => ({ ...tool, resource }));
}

async function loadCatalog(userId: string, tenantId: string): Promise<Catalog> {
  const settled = await Promise.allSettled(
    MICROSOFT_RESOURCES.map((resource) =>
      fetchServerTools(userId, resource, tenantId),
    ),
  );

  const tools: OutlookToolDefinition[] = [];
  const routes = new Map<string, MicrosoftResource>();
  const failures: unknown[] = [];

  settled.forEach((outcome, index) => {
    const resource = MICROSOFT_RESOURCES[index];
    if (outcome.status === "rejected") {
      // One unreachable server must not take the other two down with it — but
      // if nothing at all comes back, the reason still has to reach the user.
      failures.push(outcome.reason);
      console.error(
        `Work IQ tool catalog unavailable (${resource}):`,
        outcome.reason,
      );
      return;
    }
    for (const tool of outcome.value) {
      // Microsoft's names are already unique across the three servers; first
      // writer wins if that ever stops being true.
      if (routes.has(tool.name)) continue;
      routes.set(tool.name, resource);
      tools.push(tool);
    }
  });

  if (tools.length === 0) {
    // Prefer the diagnosis the user can act on: an eligibility verdict names a
    // requirement, and a dead grant tells them to reconnect. Only fall back to
    // the generic message when the failures say nothing useful.
    const actionable =
      failures.find((error) => error instanceof MicrosoftNotEligibleError) ??
      failures.find((error) => error instanceof MicrosoftNotConnectedError);
    throw actionable ?? new OutlookMcpError("Could not load Outlook tools.");
  }
  return { tools, routes, fetchedAt: Date.now() };
}

async function getCatalog(userId: string): Promise<Catalog> {
  const grant = await getGrant(userId);
  if (!grant) throw new MicrosoftNotConnectedError();
  const { tenantId } = grant;

  const cached = catalogs.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) return cached;

  const pending = inFlight.get(tenantId);
  if (pending) return pending;

  const request = (async () => {
    const catalog = await loadCatalog(userId, tenantId);
    remember(catalogs, tenantId, catalog);
    return catalog;
  })();
  inFlight.set(tenantId, request);

  try {
    return await request;
  } catch (error) {
    // Serve a stale catalog rather than an empty tool list.
    if (cached) return cached;
    throw error;
  } finally {
    inFlight.delete(tenantId);
  }
}

/**
 * The live tool catalog, straight from Microsoft — the union of all three
 * Work IQ servers, never hardcoded, so tools Microsoft adds or renames show up
 * on their own. Cached per tenant for an hour.
 */
export async function listOutlookTools(
  userId: string,
): Promise<OutlookToolDefinition[]> {
  const { tools } = await getCatalog(userId);
  return tools;
}

// --- execution --------------------------------------------------------------

/**
 * Runs one Outlook tool as the user, against whichever Work IQ server owns it.
 * Mirrors callGmailTool / callCalendarTool's return shape so the agent bridge
 * and dashboard treat every provider identically.
 */
export async function callOutlookTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<OutlookToolResult> {
  const { routes } = await getCatalog(userId);
  const resource = routes.get(name);
  if (!resource) throw new OutlookMcpError(`Unknown tool: ${name}`);

  const grant = await getGrant(userId);
  if (!grant) throw new MicrosoftNotConnectedError();

  let response: JsonRpcResponse;
  try {
    response = await callServer(userId, resource, grant.tenantId, {
      method: "tools/call",
      params: { name, arguments: args },
    });
  } catch (error) {
    if (error instanceof McpTransportError) {
      throw new OutlookMcpError(error.message);
    }
    throw error;
  }

  if (response.error) {
    const message = response.error.message ?? "";
    const ineligible = asEligibilityError(message);
    if (ineligible) throw ineligible;
    throw new OutlookMcpError(message || "Outlook rejected the request.");
  }

  const result = response.result;
  if (!result) {
    throw new OutlookMcpError(`Empty response from ${RESOURCE_LABELS[resource]}.`);
  }

  const text = result.content?.find((part) => part.type === "text")?.text ?? "";
  if (result.isError) {
    const ineligible = asEligibilityError(text);
    if (ineligible) throw ineligible;
    throw new OutlookMcpError(text || "Outlook could not run that tool.");
  }
  return { text, structured: result.structuredContent };
}

/** Drops cached sessions and catalog state for a user who just disconnected. */
export function forgetOutlookSessions(userId: string): void {
  for (const resource of MICROSOFT_RESOURCES) {
    sessions.delete(`${userId}:${resource}`);
  }
}
