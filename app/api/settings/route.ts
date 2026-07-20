import { adminSql } from "@/lib/server/db";
import { assertSameOrigin } from "@/lib/server/request-origin";
import { getSessionUser, unauthorized } from "@/lib/server/session";

type SettingsRow = {
  briefing_time: string;
  timezone: string;
  channels: Record<string, boolean>;
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const rows = await adminSql<SettingsRow>(
    `SELECT briefing_time, timezone, channels
     FROM public.user_settings WHERE user_id = $1`,
    [user.id]
  );
  return Response.json({ settings: rows[0] ?? null });
}

export async function PUT(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: {
    briefing_time?: string;
    timezone?: string;
    channels?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const briefingTime = body.briefing_time ?? "08:00";
  const timezone = body.timezone ?? "UTC";
  if (!/^\d{2}:\d{2}$/.test(briefingTime)) {
    return Response.json({ error: "Invalid briefing time." }, { status: 400 });
  }
  if (typeof timezone !== "string" || timezone.length > 100) {
    return Response.json({ error: "Invalid timezone." }, { status: 400 });
  }
  const raw = body.channels ?? {};
  const channels = {
    in_app: raw.in_app !== false,
    email: raw.email !== false,
    slack: raw.slack === true,
    whatsapp: raw.whatsapp === true,
  };

  const rows = await adminSql<SettingsRow>(
    `INSERT INTO public.user_settings (user_id, briefing_time, timezone, channels, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET
       briefing_time = EXCLUDED.briefing_time,
       timezone = EXCLUDED.timezone,
       channels = EXCLUDED.channels,
       updated_at = now()
     RETURNING briefing_time, timezone, channels`,
    [user.id, briefingTime, timezone, JSON.stringify(channels)]
  );
  return Response.json({ settings: rows[0] });
}
