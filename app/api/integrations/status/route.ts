import { adminSql } from "@/lib/server/db";
import { assertSameOrigin } from "@/lib/server/request-origin";
import { getSessionUser, unauthorized } from "@/lib/server/session";

type IntegrationRow = {
  provider: string;
  status: string;
  connected_at: string | null;
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const rows = await adminSql<IntegrationRow>(
    `SELECT provider, status, connected_at
     FROM public.user_integrations WHERE user_id = $1`,
    [user.id]
  );
  return Response.json({ integrations: rows });
}

export async function PUT(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: { provider?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const provider = (body.provider ?? "").trim();
  const status = body.status;
  if (!provider || !/^[a-z0-9_-]{1,40}$/.test(provider)) {
    return Response.json({ error: "Invalid provider." }, { status: 400 });
  }
  // Gmail and WhatsApp have dedicated connect/disconnect flows that manage
  // server-side state (tokens, sockets); they cannot be toggled directly.
  if (provider === "gmail" || provider === "whatsapp") {
    return Response.json(
      { error: `${provider} is managed by its own connect flow.` },
      { status: 400 }
    );
  }
  if (status !== "connected" && status !== "disconnected") {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }

  const rows = await adminSql<IntegrationRow>(
    `INSERT INTO public.user_integrations (user_id, provider, status, connected_at)
     VALUES ($1, $2, $3, CASE WHEN $3 = 'connected' THEN now() END)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       status = EXCLUDED.status,
       connected_at = EXCLUDED.connected_at,
       updated_at = now()
     RETURNING provider, status, connected_at`,
    [user.id, provider, status]
  );
  return Response.json({ integration: rows[0] });
}
