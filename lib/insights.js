import { db } from "./insightsDb.js";

// The read side of Question Insights. Every exported function here is the
// ONLY way either delivery format (the real-time feed and the quarterly
// report) touches insight_events — so the minimum-aggregation floor lives
// here once, not duplicated per caller. No function in this file can return
// a single-record lookup; everything is a count or a breakdown of counts.

export const MIN_AGGREGATE_THRESHOLD = 20;

const COORDINATE_FIELDS = ["age_bucket", "partner_age_bucket", "prior_marriages", "cohabitating", "years_together_bucket"];

// Callers pass either a trailing window (sinceDays, for the real-time feed)
// or an explicit historical [since, until) range (for the quarterly report,
// which needs a specific past quarter, not "N days before now").
function resolveRange({ since, until, sinceDays = 90 } = {}) {
  const end = until ? new Date(until) : new Date();
  const start = since ? new Date(since) : new Date(end.getTime() - sinceDays * 86400000);
  return { start, end };
}

function guardCount(n) {
  return n < MIN_AGGREGATE_THRESHOLD ? { n, suppressed: true } : { n, suppressed: false };
}

function guardBreakdown(rows, keyField) {
  const totalN = rows.reduce((a, r) => a + Number(r.n), 0);
  if (totalN < MIN_AGGREGATE_THRESHOLD) {
    return { n: totalN, suppressed: true, reason: `fewer than ${MIN_AGGREGATE_THRESHOLD} underlying records` };
  }
  const breakdown = {};
  for (const r of rows) {
    breakdown[r[keyField] || "unknown"] = guardCount(Number(r.n));
  }
  return { n: totalN, suppressed: false, breakdown };
}

// Volume per domain over a window.
export async function domainVolume(opts = {}) {
  const { start, end } = resolveRange(opts);
  const { rows } = await db().query(
    `SELECT domain, count(*) AS n FROM insight_events
     WHERE logged_at >= $1 AND logged_at < $2
     GROUP BY domain`,
    [start, end]
  );
  const domains = {};
  for (const r of rows) domains[r.domain] = guardCount(Number(r.n));
  return { since: start, until: end, domains };
}

// All distinct domains with any activity in a window (used by the report to
// discover what to summarize, without hardcoding a domain list).
export async function activeDomains(opts = {}) {
  const { start, end } = resolveRange(opts);
  const { rows } = await db().query(
    `SELECT DISTINCT domain FROM insight_events WHERE logged_at >= $1 AND logged_at < $2`,
    [start, end]
  );
  return rows.map((r) => r.domain);
}

// This-period vs previous-period volume for one domain, with percent change.
export async function volumeTrend({ domain, periodDays = 7 }) {
  const end = new Date();
  const midpoint = new Date(end.getTime() - periodDays * 86400000);
  const start = new Date(end.getTime() - periodDays * 2 * 86400000);
  const { rows } = await db().query(
    `SELECT
       count(*) FILTER (WHERE logged_at >= $1 AND logged_at < $2) AS current_count,
       count(*) FILTER (WHERE logged_at >= $3 AND logged_at < $1) AS previous_count
     FROM insight_events WHERE domain = $4`,
    [midpoint, end, start, domain]
  );
  const current = guardCount(Number(rows[0].current_count));
  const previous = guardCount(Number(rows[0].previous_count));
  const percentChange =
    !current.suppressed && !previous.suppressed && previous.n > 0
      ? Math.round(((current.n - previous.n) / previous.n) * 1000) / 10
      : null;
  return { domain, periodDays, current, previous, percentChange };
}

// SPEAK / STAY_SILENT / BLOCK breakdown for a domain.
export async function gateDecisionBreakdown({ domain, ...rangeOpts }) {
  const { start, end } = resolveRange(rangeOpts);
  const { rows } = await db().query(
    `SELECT gate_decision, count(*) AS n FROM insight_events
     WHERE domain = $1 AND logged_at >= $2 AND logged_at < $3
     GROUP BY gate_decision`,
    [domain, start, end]
  );
  return { domain, since: start, until: end, ...guardBreakdown(rows, "gate_decision") };
}

// firm / moderate / thin breakdown, spoken verdicts only.
export async function confidenceBreakdown({ domain, ...rangeOpts }) {
  const { start, end } = resolveRange(rangeOpts);
  const { rows } = await db().query(
    `SELECT confidence, count(*) AS n FROM insight_events
     WHERE domain = $1 AND gate_decision = 'SPEAK' AND logged_at >= $2 AND logged_at < $3
     GROUP BY confidence`,
    [domain, start, end]
  );
  return { domain, since: start, until: end, ...guardBreakdown(rows, "confidence") };
}

// Distribution of one coordinate field's bucket values, spoken verdicts only.
export async function coordinateDistribution({ domain, field, ...rangeOpts }) {
  if (!COORDINATE_FIELDS.includes(field)) {
    throw new Error(`Unknown coordinate field: ${field}`);
  }
  const { start, end } = resolveRange(rangeOpts);
  const { rows } = await db().query(
    `SELECT coordinates->>$1 AS bucket, count(*) AS n FROM insight_events
     WHERE domain = $2 AND gate_decision = 'SPEAK' AND logged_at >= $3 AND logged_at < $4
     GROUP BY bucket`,
    [field, domain, start, end]
  );
  return { domain, field, since: start, until: end, ...guardBreakdown(rows, "bucket") };
}

export function availableCoordinateFields() {
  return [...COORDINATE_FIELDS];
}
