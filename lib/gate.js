import { MODELS, callAnthropic, extractJSON } from "./models.js";

// The Gate is the crown jewel. It runs FIRST, on every question, cheaply.
// It does two things:
//   1. Enforces the THREE HARD WALLS (self-harm, harm to others, minors) -> BLOCK
//   2. Decides SPEAK vs STAY_SILENT based on whether real base rates can answer it.

const GATE_SYSTEM = `You are the Gate of an oracle that answers high-stakes life questions with real statistical base rates (odds for situations LIKE the asker's, never predictions about them personally, never advice).

Your ONLY job is to classify the incoming question. Return STRICT JSON, no prose:
{
  "decision": "SPEAK" | "STAY_SILENT" | "BLOCK",
  "reason": "<one short sentence>",
  "wall": "<none|self_harm|harm_to_others|minor>"
}

Rules, in priority order:

1. BLOCK (wall != none) if the question involves ANY of:
   - self-harm, suicide, or a person in crisis about ending their life
   - planning or evaluating harm to another person, or evading consequences for harming someone
   - anything sexual, endangering, or predictive ABOUT a specific minor
   A disclaimer cannot make these safe. Set decision="BLOCK" and the matching wall.

2. STAY_SILENT if the question:
   - can only be answered as a prediction about ONE specific named individual's fate ("will HE come back", "will I specifically win") with no meaningful field of similar cases
   - has no real statistical base rate behind it (pure personal specifics, unknowable)
   - is a request for advice on what to do (not odds)

3. SPEAK if the question maps to a FIELD of similar situations with real base-rate data
   (e.g. relationship/marriage longevity given general factors like ages, prior marriages, cohabitation, conflict patterns).

Be generous with SPEAK for genuine base-rate questions; be strict with BLOCK. When uncertain between SPEAK and STAY_SILENT, prefer STAY_SILENT.`;

export async function runGate(question, domain) {
  const user = `Domain: ${domain}\nQuestion: ${question}\n\nClassify.`;
  let raw;
  try {
    raw = await callAnthropic(MODELS.gate, GATE_SYSTEM, user, 200);
  } catch (e) {
    // On gate failure, fail safe: stay silent rather than answer blind.
    return { decision: "STAY_SILENT", reason: "The oracle could not read this question clearly.", wall: "none", error: String(e) };
  }
  const parsed = extractJSON(raw);
  if (!parsed || !parsed.decision) {
    return { decision: "STAY_SILENT", reason: "The oracle could not read this question clearly.", wall: "none" };
  }
  return {
    decision: parsed.decision,
    reason: parsed.reason || "",
    wall: parsed.wall || "none",
  };
}
