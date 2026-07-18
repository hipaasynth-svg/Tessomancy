import { MODELS, callAnthropic, extractJSON } from "./models.js";

// Coordinate extraction for Question Insights ONLY. This runs alongside the
// real pipeline, never feeds back into it, and never sees the outcome of the
// question — its only job is turning free text into a small set of coarse,
// enum-only buckets for aggregate analytics. The free text itself is never
// returned, stored, or logged; only the whitelisted bucket values below are.

const AGE_BUCKETS = ["18-24", "25-34", "35-44", "45-54", "55+", "unknown"];
const MARRIAGE_BUCKETS = ["none", "one", "two_or_more", "unknown"];
const TOGETHER_BUCKETS = ["<1", "1-3", "3-7", "7-15", "15+", "unknown"];
const BOOL_UNKNOWN = [true, false, "unknown"];

// Per-domain field schemas. Add an entry here when a new domain is registered
// in app/api/verdict/route.js's MEMORY map, if it has coordinate-worthy fields.
const DOMAIN_SCHEMAS = {
  relationships: {
    age_bucket: AGE_BUCKETS,
    partner_age_bucket: AGE_BUCKETS,
    prior_marriages: MARRIAGE_BUCKETS,
    cohabitating: BOOL_UNKNOWN,
    years_together_bucket: TOGETHER_BUCKETS,
  },
};

const EXTRACT_SYSTEM = (fields) => `You extract ONLY coarse, bucketed demographic-style facts from a question, for anonymous aggregate statistics. You never see or repeat the question's wording back — only bucket values.

Return STRICT JSON with exactly these keys, each set to one of its allowed values (use "unknown" — or false where listed — whenever the question doesn't say):
${JSON.stringify(fields, null, 2)}

Rules:
- Never output free text, names, or anything not in the allowed value lists.
- If the question doesn't mention a field, its value is "unknown" (or the unknown-equivalent listed).
- Be conservative: only fill a bucket when the question clearly implies it.`;

// Validates every value against its field's allow-list; anything invalid or
// missing collapses to "unknown". This is a hard whitelist, not just a prompt
// instruction — it's the actual guarantee that free text can never leak in.
function sanitize(fields, raw) {
  const out = {};
  for (const [key, allowed] of Object.entries(fields)) {
    const value = raw?.[key];
    out[key] = allowed.includes(value) ? value : "unknown";
  }
  return out;
}

export async function extractCoordinates(question, domain) {
  const fields = DOMAIN_SCHEMAS[domain];
  if (!fields) return null;

  try {
    const raw = await callAnthropic(MODELS.gate, EXTRACT_SYSTEM(fields), question, 200);
    const parsed = extractJSON(raw);
    return sanitize(fields, parsed);
  } catch {
    // Non-fatal: insights are best-effort. Return an all-unknown row rather
    // than failing the log write.
    return sanitize(fields, {});
  }
}
