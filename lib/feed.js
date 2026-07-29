import { db } from "./insightsDb.js";

// Powers the homepage's public "Collective" feed — a handful of recent
// readings shown to any visitor. Distinct from lib/insights.js (the paid
// Insights product, which enforces a minimum-aggregate floor): no floor is
// needed here because each row already carries nothing that could identify
// an asker — domain, top odds, and confidence only, never coordinates and
// never question text (insight_events never stores question text at all).
export async function recentReadings({ limit = 10 } = {}) {
  const { rows } = await db().query(
    `SELECT domain, outcomes, confidence, logged_at FROM insight_events
     WHERE gate_decision = 'SPEAK' AND outcomes IS NOT NULL
     ORDER BY logged_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows
    .map((row) => {
      const outcomes = Array.isArray(row.outcomes) ? row.outcomes : [];
      const top = outcomes.reduce(
        (best, o) => (o && typeof o.probability === "number" && (!best || o.probability > best.probability) ? o : best),
        null
      );
      if (!top) return null;
      return {
        topic: row.domain,
        odds: Math.round(top.probability),
        confidence: row.confidence,
        loggedAt: row.logged_at,
      };
    })
    .filter(Boolean);
}
