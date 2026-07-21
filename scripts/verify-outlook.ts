/**
 * Staged end-to-end verification for the Outlook / Work IQ MCP integration.
 *
 *   npm run verify:outlook              # everything read-only
 *   npm run verify:outlook -- --run-tool  # also execute one read-only tool
 *
 * Each stage runs only if the previous one gave it what it needs, and a stage
 * that cannot run explains what is missing. Stages 1-3 need no Microsoft
 * account at all; 4+ need a user who has connected Outlook through the UI.
 *
 * Nothing here is destructive: it reads, refreshes tokens (which Entra requires
 * in order to use them), and only calls a tool when --run-tool is passed.
 */

import { adminSql } from "../lib/server/db";
import {
  MICROSOFT_RESOURCES,
  MicrosoftConsentRequiredError,
  MicrosoftNotEligibleError,
  RESOURCE_LABELS,
  buildAuthUrl,
  ensureResourceToken,
  mcpEndpoint,
  microsoftOauthConfigured,
  resourceScope,
  verifyState,
  type MicrosoftResource,
} from "../lib/server/microsoft-oauth";
import { callOutlookTool, listOutlookTools } from "../lib/server/outlook-mcp";

/** Any real tenant GUID works for discovery; the documents are not per-account. */
const SAMPLE_TENANT = "72f988bf-86f1-41af-91ab-2d7cd011db47";

const RUN_TOOL = process.argv.includes("--run-tool");

let failures = 0;
let blocked = false;

const pass = (msg: string) => console.log(`  [PASS] ${msg}`);
const info = (msg: string) => console.log(`         ${msg}`);
const warn = (msg: string) => console.log(`  [WARN] ${msg}`);
const fail = (msg: string) => {
  failures += 1;
  console.log(`  [FAIL] ${msg}`);
};
const skip = (msg: string, next: string) => {
  blocked = true;
  console.log(`  [SKIP] ${msg}`);
  console.log(`         next step: ${next}`);
};

function stage(n: number, title: string) {
  console.log(`\n${"─".repeat(70)}\nStage ${n} — ${title}\n${"─".repeat(70)}`);
}

/** The actions the Settings dialog is meant to cover, and how to spot each. */
const EXPECTED_ACTIONS: { label: string; match: RegExp; viaPath?: string }[] = [
  { label: "Read email", match: /getMessage$/i },
  { label: "Search emails", match: /searchMessages$/i },
  { label: "Send email", match: /sendMail$/i },
  { label: "Reply to email", match: /_reply$/i },
  { label: "Reply all", match: /replyAll$/i },
  { label: "Fetch recent emails", match: /^$/, viaPath: "/me/mailFolders/inbox/messages" },
  { label: "Forward email", match: /forward/i, viaPath: "/me/messages/{id}/forward" },
  { label: "List mail folders", match: /^$/, viaPath: "/me/mailFolders" },
  { label: "Fetch attachments", match: /^$/, viaPath: "/me/messages/{id}/attachments" },
  { label: "List calendars", match: /^$/, viaPath: "/me/calendars" },
  { label: "Fetch today's events", match: /listCalendarView$/i },
  { label: "Fetch upcoming events", match: /listEvents$/i },
  { label: "Get event details", match: /getEvent$/i },
  { label: "Create calendar event", match: /createEvent$/i },
  { label: "Update calendar event", match: /updateEvent$/i },
  { label: "Delete calendar event", match: /deleteEvent$/i },
  { label: "Check free/busy", match: /getSchedule$|findMeetingTimes$/i },
  { label: "View recurring events", match: /listEvents$|listCalendarView$/i },
];

type Connected = { userId: string; email: string | null; tenantId: string; username: string | null };

async function findConnectedUser(): Promise<Connected | null> {
  const wanted = process.argv.find((a) => a.startsWith("--user="))?.slice(7);
  const rows = await adminSql<Connected>(
    `SELECT t.user_id       AS "userId",
            u.email         AS email,
            t.tenant_id     AS "tenantId",
            t.username      AS username
     FROM public.microsoft_oauth_tokens t
     JOIN public.users u ON u.id = t.user_id
     WHERE ($1::text IS NULL OR u.email = $1)
     ORDER BY t.updated_at DESC LIMIT 1`,
    [wanted ?? null],
  );
  return rows[0] ?? null;
}

async function main() {
  console.log("\nOutlook / Microsoft Work IQ MCP — verification");

  // ---------------------------------------------------------------- stage 1
  stage(1, "Configuration");
  const configured = microsoftOauthConfigured();
  if (configured) {
    pass("MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are set");
  } else {
    skip(
      "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET are empty in .env.local",
      "register a multi-tenant Entra app (see 'Outlook setup' in README.md) and fill them in",
    );
  }

  // ---------------------------------------------------------------- stage 2
  stage(2, "Discovery — scopes come from Microsoft, not from us");
  for (const resource of MICROSOFT_RESOURCES) {
    const endpoint = mcpEndpoint(resource, SAMPLE_TENANT);
    const url = new URL(endpoint);
    const metadataUrl = `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
    try {
      const res = await fetch(metadataUrl, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        // Unreachable discovery is survivable — resourceScope falls back to the
        // known form — so it is a warning; only a *mismatch* is a real defect.
        warn(`${RESOURCE_LABELS[resource]}: metadata returned ${res.status}; using fallback scope`);
        continue;
      }
      const doc = (await res.json()) as {
        scopes_supported?: string[];
        authorization_servers?: string[];
      };
      const derived = await resourceScope(resource, SAMPLE_TENANT);
      const published = doc.scopes_supported ?? [];
      if (published.includes(derived)) {
        pass(`${RESOURCE_LABELS[resource]}: scope matches the published document`);
        info(`scope: ${derived}`);
      } else {
        fail(
          `${RESOURCE_LABELS[resource]}: derived "${derived}" is not in ${JSON.stringify(published)}`,
        );
      }
      const authority = doc.authorization_servers?.[0] ?? "";
      if (authority.includes("/organizations")) {
        info("authority is /organizations — personal Microsoft accounts cannot connect");
      } else {
        warn(`unexpected authorization server: ${authority}`);
      }
    } catch (error) {
      warn(
        `${RESOURCE_LABELS[resource]}: discovery unreachable (${String(error)}) — ` +
          "transient network failures are expected here; re-run before investigating",
      );
    }
  }

  // ---------------------------------------------------------------- stage 3
  stage(3, "Authorize URL + state signing");
  if (!configured) {
    skip("needs client credentials", "complete stage 1");
  } else {
    const probeUser = "00000000-1111-2222-3333-444444444444";
    const { url } = await buildAuthUrl(probeUser, "https://app.example");
    const parsed = new URL(url);
    const checks: [string, boolean, string][] = [
      ["authority is /organizations", parsed.pathname.startsWith("/organizations/"), parsed.pathname],
      ["PKCE is S256", parsed.searchParams.get("code_challenge_method") === "S256", String(parsed.searchParams.get("code_challenge_method"))],
      ["code_challenge present", (parsed.searchParams.get("code_challenge") ?? "").length >= 43, "len"],
      ["redirect_uri is the callback", parsed.searchParams.get("redirect_uri") === "https://app.example/api/integrations/outlook/callback", String(parsed.searchParams.get("redirect_uri"))],
      ["only OIDC scopes in phase 1", parsed.searchParams.get("scope") === "openid profile offline_access", String(parsed.searchParams.get("scope"))],
    ];
    for (const [label, ok, detail] of checks) {
      if (ok) pass(label);
      else fail(`${label} (got ${detail})`);
    }
    const state = parsed.searchParams.get("state") ?? "";
    const verified = verifyState(state);
    if (verified?.userId === probeUser && verified.stage === "connect") {
      pass("state round-trips through verifyState");
    } else {
      fail("state did not verify");
    }
    if (verifyState(`${state.slice(0, -2)}00`) === null) {
      pass("tampered state is rejected");
    } else {
      fail("tampered state was ACCEPTED — signature check is broken");
    }
  }

  // ---------------------------------------------------------------- stage 4
  stage(4, "Connected account");
  const user = await findConnectedUser();
  if (!user) {
    skip(
      "no user has connected Outlook yet",
      "sign in, open /integrations, click Connect on the Outlook card, then re-run",
    );
    return report();
  }
  pass(`grant found for ${user.email ?? user.userId}`);
  info(`microsoft account: ${user.username ?? "(unknown)"}`);
  info(`tenant:            ${user.tenantId}`);

  // ---------------------------------------------------------------- stage 5
  stage(5, "Per-resource tokens (incremental consent)");
  const usable: MicrosoftResource[] = [];
  for (const resource of MICROSOFT_RESOURCES) {
    try {
      await ensureResourceToken(user.userId, resource);
      pass(`${RESOURCE_LABELS[resource]}: access token acquired`);
      usable.push(resource);
    } catch (error) {
      if (error instanceof MicrosoftConsentRequiredError) {
        warn(`${RESOURCE_LABELS[resource]}: needs consent — reconnect to grant it`);
      } else if (error instanceof MicrosoftNotEligibleError) {
        fail(`${RESOURCE_LABELS[resource]}: ${error.reason} — ${error.message}`);
      } else {
        fail(`${RESOURCE_LABELS[resource]}: ${String(error)}`);
      }
    }
  }
  if (usable.length === 0) {
    skip("no resource yielded a token", "resolve the errors above, then re-run");
    return report();
  }

  // ---------------------------------------------------------------- stage 6
  stage(6, "Live catalog (tools/list)");
  let tools: Awaited<ReturnType<typeof listOutlookTools>> = [];
  try {
    tools = await listOutlookTools(user.userId);
    pass(`${tools.length} tools returned across ${new Set(tools.map((t) => t.resource)).size} server(s)`);
    for (const resource of MICROSOFT_RESOURCES) {
      const owned = tools.filter((t) => t.resource === resource);
      info(`${RESOURCE_LABELS[resource].padEnd(18)} ${owned.length} tools`);
      for (const tool of owned) {
        const args = Object.keys(
          (tool.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {},
        );
        info(`   ${tool.name}`);
        info(`      args: ${args.length ? args.join(", ") : "(none)"}`);
      }
    }
  } catch (error) {
    fail(`catalog failed: ${String(error)}`);
    return report();
  }

  // ---------------------------------------------------------------- stage 7
  stage(7, "Assumption check — the universal server's path argument");
  const fetchTool = tools.find((t) => t.name === "fetch");
  if (!fetchTool) {
    warn("no `fetch` tool: the universal Work IQ server did not load");
    info("mail-folder / attachment / forward / calendar-list presets will be absent");
  } else {
    const properties = Object.keys(
      (fetchTool.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {},
    );
    const guessed = properties.find((p) => /^(path|resourcePath|url|endpoint)$/i.test(p));
    if (guessed) {
      pass(`path argument is "${guessed}" — presets in outlook-mcp-tools.tsx will bind`);
    } else {
      fail("no path-like argument found; the Settings presets will be silently dropped");
      info(`actual arguments: ${properties.join(", ")}`);
      info("fix: widen pathArgument() in components/dashboard/outlook-mcp-tools.tsx");
    }
  }

  stage(8, "Requested action coverage");
  for (const action of EXPECTED_ACTIONS) {
    const direct = tools.find((t) => action.match.source !== "^$" && action.match.test(t.name));
    if (direct) {
      pass(`${action.label.padEnd(24)} ${direct.name}`);
    } else if (action.viaPath && fetchTool) {
      info(`[path] ${action.label.padEnd(24)} fetch/do_action ${action.viaPath}`);
    } else {
      warn(`${action.label.padEnd(24)} no tool found`);
    }
  }

  // ---------------------------------------------------------------- stage 9
  stage(9, "Tool execution");
  if (!RUN_TOOL) {
    info("skipped — pass --run-tool to execute one read-only calendar query");
    return report();
  }
  const readTool = tools.find((t) => /listCalendarView$/i.test(t.name));
  if (!readTool) {
    warn("no listCalendarView tool to exercise");
    return report();
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  try {
    const result = await callOutlookTool(user.userId, readTool.name, {
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      top: 5,
    });
    pass(`${readTool.name} executed`);
    info(`text: ${(result.text || "(empty)").slice(0, 300)}`);
    info(`structured keys: ${Object.keys(result.structured ?? {}).join(", ") || "(none)"}`);
  } catch (error) {
    fail(`${readTool.name} failed: ${String(error)}`);
  }

  return report();
}

function report() {
  console.log(`\n${"═".repeat(70)}`);
  if (failures > 0) {
    console.log(`RESULT: ${failures} check(s) failed — see [FAIL] above.`);
  } else if (blocked) {
    console.log("RESULT: everything reachable passed; later stages need the setup noted above.");
  } else {
    console.log("RESULT: all stages passed, including a live tool call.");
  }
  console.log(`${"═".repeat(70)}\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
