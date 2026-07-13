import {
  getResult,
  listResultSummaries,
} from "@/lib/server/briefing/store";
import { isUuid } from "@/lib/server/gmail-oauth";

/**
 * GET ?userId=&id=            → { result }  (one generated briefing, full data)
 * GET ?userId=&briefingId?=&limit?=&before?= → { results } (history summaries)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? "";
  if (!isUuid(userId)) {
    return Response.json({ error: "Invalid user id." }, { status: 400 });
  }

  const id = url.searchParams.get("id");
  try {
    if (id) {
      if (!isUuid(id)) {
        return Response.json({ error: "Invalid briefing id." }, { status: 400 });
      }
      const result = await getResult(userId, id);
      if (!result) {
        return Response.json({ error: "Briefing not found." }, { status: 404 });
      }
      return Response.json({ result });
    }

    const briefingId = url.searchParams.get("briefingId") ?? undefined;
    if (briefingId && !isUuid(briefingId)) {
      return Response.json({ error: "Invalid briefing id." }, { status: 400 });
    }
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20),
    );
    const before = url.searchParams.get("before") ?? undefined;
    if (before && Number.isNaN(Date.parse(before))) {
      return Response.json({ error: "Invalid cursor." }, { status: 400 });
    }
    const results = await listResultSummaries(userId, { briefingId, limit, before });
    return Response.json({ results });
  } catch (error) {
    console.error("Briefings: results failed:", error);
    return Response.json(
      { error: "Could not load briefings. Please retry." },
      { status: 500 },
    );
  }
}
