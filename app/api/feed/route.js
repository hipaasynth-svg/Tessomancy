import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT question_hash, question, topic, odds, line, created_at
      FROM question_insights
      WHERE is_refused = false
        AND odds IS NOT NULL
        AND line IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 12
    `;

    const safe = (rows || []).map((r) => ({
      question: r.question?.length > 90 ? r.question.slice(0, 90) + "…" : r.question,
      topic: r.topic ?? "fate",
      odds: r.odds,
      line: r.line?.length > 120 ? r.line.slice(0, 120) + "…" : r.line,
    }));

    return Response.json(safe);
  } catch {
    return Response.json([]);
  }
}
