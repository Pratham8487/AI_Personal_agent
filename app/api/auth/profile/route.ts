import { adminSql } from "@/lib/server/db";
import { assertSameOrigin } from "@/lib/server/request-origin";
import { getSessionUser, unauthorized, type SessionUser } from "@/lib/server/session";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  providers: string[];
  email_verified: boolean;
  contact_verified: boolean;
  tour_completed: boolean;
  active: boolean;
};

export async function PATCH(request: Request) {
  const crossOrigin = assertSameOrigin(request);
  if (crossOrigin) return crossOrigin;

  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorized();

  let body: { tourCompleted?: boolean; name?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const sets: string[] = [];
  const params: unknown[] = [sessionUser.id];

  if (body.tourCompleted !== undefined) {
    if (typeof body.tourCompleted !== "boolean") {
      return Response.json({ error: "Invalid tourCompleted value." }, { status: 400 });
    }
    params.push(body.tourCompleted);
    sets.push(`tour_completed = $${params.length}`);
  }
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.length > 255) {
      return Response.json({ error: "Invalid name." }, { status: 400 });
    }
    params.push(body.name.trim() || null);
    sets.push(`name = $${params.length}`);
  }
  if (sets.length === 0) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }

  const rows = await adminSql<UserRow>(
    `UPDATE public.users SET ${sets.join(", ")}, updated_at = now()
     WHERE id = $1
     RETURNING id, email, name, avatar_url, phone, providers, email_verified,
               contact_verified, tour_completed, active`,
    params
  );
  const row = rows[0];
  const user: SessionUser = {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    providers: row.providers ?? [],
    emailVerified: row.email_verified,
    contactVerified: row.contact_verified,
    tourCompleted: row.tour_completed,
    active: row.active,
  };
  return Response.json({ user });
}
