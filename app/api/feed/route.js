import { recentReadings } from "../../../lib/feed.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await recentReadings({ limit: 10 });
    return Response.json(items);
  } catch {
    // No DATABASE_URL configured, or the query failed — the feed is
    // decorative, so degrade to empty rather than surfacing an error.
    return Response.json([]);
  }
}
