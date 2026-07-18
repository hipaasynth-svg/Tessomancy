import { db } from "./insightsDb.js";

// Everything here is best-effort and MUST NEVER throw into the caller — a
// logging failure must never break the oracle's user-facing response. It also
// never receives the raw question text or any billing/device identifier;
// callers only pass through what's meant to be stored.

function truncatedToHour(date = new Date()) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

// Coarse region only — country, or country + first-level subdivision (state/
// province). Never city, never an IP address. Vercel's edge network sets
// these headers automatically in production; anywhere else they're simply
// absent, which is fine (region is always optional).
export function coarseRegionFromHeaders(headers) {
  const country = headers.get("x-vercel-ip-country");
  const region = headers.get("x-vercel-ip-country-region");
  if (!country) return null;
  return region ? `${country}-${region}` : country;
}

async function insert(row) {
  try {
    await db().query(
      `INSERT INTO insight_events (domain, gate_decision, wall_type, coordinates, outcomes, confidence, region, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        row.domain,
        row.gate_decision,
        row.wall_type || null,
        row.coordinates ? JSON.stringify(row.coordinates) : null,
        row.outcomes ? JSON.stringify(row.outcomes) : null,
        row.confidence || null,
        row.region || null,
        truncatedToHour(),
      ]
    );
  } catch (e) {
    console.error("insights log write failed (non-fatal)", e);
  }
}

export async function logBlocked({ domain, wallType, region }) {
  await insert({ domain, gate_decision: "BLOCK", wall_type: wallType, region });
}

export async function logSilent({ domain, region }) {
  await insert({ domain, gate_decision: "STAY_SILENT", region });
}

export async function logSpoken({ domain, coordinates, outcomes, confidence, region }) {
  await insert({ domain, gate_decision: "SPEAK", coordinates, outcomes, confidence, region });
}
