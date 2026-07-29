import { recentReadings } from "../../../lib/feed.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await recentReadings({ limit: 8 });
    return Response.json(items);
  } catch {
    return Response.json([]);
  }
}
