import { MODELS, callAnthropicSearch, extractJSON } from "./models.js";

// Grounded reasoning: the general-purpose brain. For ANY question that clears
// the Gate, it searches the live web for real base-rate data for the FIELD the
// question is about, then produces honest ranked odds grounded in what it
// found. If it can't find real statistical grounding, it stays silent — it
// never invents numbers, and it never gives advice.
//
// The liability guardrail is load-bearing and identical to the curated path:
// odds about the FIELD only, never a prediction about the individual, never
// "you should", never advice. Breaking that is what turns a probabilistic
// reading into legal exposure.

const GROUND_SYSTEM = `You are the reasoning core of an oracle. For a high-stakes life question, you produce HONEST statistical odds for the FIELD of situations like the asker's — grounded in real data you find by searching the web.

You have a web_search tool. USE IT: search for real base rates, published statistics, and research findings that bear on the question's field. Ground every number in what you actually find.

Then return STRICT JSON, no prose, no markdown fences:
{
  "speak": true,
  "outcomes": [
    { "label": "<short outcome phrased about the FIELD>", "probability": <0-100 integer> },
    ... 2 to 4 outcomes, probabilities summing to ~100 ...
  ],
  "confidence": "firm" | "moderate" | "thin",
  "basis": "<one sentence naming what the odds rest on, e.g. the kind of source>",
  "mirror_candidates": [
    "<a true, surprising, sourced one-line statistic that reframes the question>",
    "... 2 to 4 candidates, each factual and drawn from what you found ..."
  ]
}

If — after searching — you cannot find real statistical base rates for this field (the question is too specific, unknowable, or unsupported by data), return exactly:
{ "speak": false }

ABSOLUTE RULES (these define the product and its legal footing — never break them):
- FIELD, NOT PERSON. Phrase every outcome about the field of similar cases ("Relationships with these traits that last past 10 years", "Startups in this sector that survive 5 years"), NEVER "You will..." and NEVER about the asker as an individual.
- ODDS, NOT ADVICE. Never tell the asker what to do. Never say "you should", "I recommend", "the best choice", or anything prescriptive. You state the odds; the choice and its consequences are theirs. This is not legal, medical, or financial advice.
- NEVER INVENT NUMBERS. Every probability and every mirror stat must trace to something you actually found by searching (or to provided reference data). If the data is thin, say so via "confidence": "thin" or stay silent — do not fabricate false precision.
- NO SECOND PERSON in outcome labels or mirror stats. No emojis. No advice.
- Set "confidence" to "thin" when the field is sparsely studied or your sources are weak; "firm" only when solid base rates map cleanly.`;

export async function runGroundedReason(question, referenceData) {
  const refBlock = referenceData
    ? `\n\nYou also have this CURATED, PRE-VETTED reference data for the relevant domain. Prefer it where it applies, and use web search to supplement or update it:\n${JSON.stringify(referenceData, null, 2)}`
    : "";

  const user = `QUESTION:\n${question}\n\nSearch for real base rates for the field this question is about, then return the odds JSON. If you cannot find real data, return {"speak": false}.${refBlock}`;

  let parsed = null;
  try {
    const raw = await callAnthropicSearch(MODELS.ground, GROUND_SYSTEM, user, 1500);
    parsed = extractJSON(raw);
  } catch (e) {
    // Non-fatal to the app, but this question can't be answered honestly now.
    return { speak: false, error: String(e) };
  }

  if (!parsed || parsed.speak === false || !Array.isArray(parsed.outcomes) || parsed.outcomes.length === 0) {
    return { speak: false };
  }

  // Normalize probabilities to sum ~100 (same discipline as the curated path).
  const sum = parsed.outcomes.reduce((a, o) => a + (Number(o.probability) || 0), 0) || 1;
  const outcomes = parsed.outcomes.map((o) => ({
    label: String(o.label || "").slice(0, 160),
    probability: Math.round(((Number(o.probability) || 0) / sum) * 100),
  }));

  const mirrorCandidates = Array.isArray(parsed.mirror_candidates)
    ? parsed.mirror_candidates.filter((s) => typeof s === "string" && s.trim()).slice(0, 4)
    : [];

  return {
    speak: true,
    outcomes,
    confidence: parsed.confidence || "moderate",
    basis: parsed.basis || "",
    mirrorCandidates,
  };
}
