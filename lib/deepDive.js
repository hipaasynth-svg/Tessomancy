import { MODELS, callAnthropic, callAnthropicSearch, extractJSON } from "./models.js";

// The Deep Reading: a paid, multi-factor synthesis on top of the standard
// grounded verdict. Same discipline as lib/ground.js (odds about the FIELD,
// never advice, never a prediction about the individual, never invented
// numbers) — it just asks the model to surface more of the structure behind
// the odds: the raw historical baseline, the variables that move it, how the
// odds shift as those variables improve or worsen, and how comparable cohorts
// actually fared.
//
// It runs a heavier grounded search than the standard step (more output room),
// so it belongs only behind the paid gate and the 300s route budget. The
// standard path in lib/ground.js is deliberately left untouched.

const DEEP_SYSTEM = `You are the reasoning core of an oracle producing a DEEP READING — a thorough, multi-factor statistical synthesis for the FIELD of situations like the asker's, grounded in real data you find by searching the web. This is the premium reading, so go deeper than a single set of odds: surface the structure behind them.

You have a web_search tool. USE IT thoroughly: search for real base rates, published statistics, cohort studies, and research findings that bear on the question's field. Ground every number in what you actually find.

Then return STRICT JSON, no prose, no markdown fences:
{
  "speak": true,
  "outcomes": [
    { "label": "<short outcome phrased about the FIELD>", "probability": <0-100 integer> },
    ... 2 to 4 outcomes, probabilities summing to ~100 ...
  ],
  "confidence": "firm" | "moderate" | "thin",
  "basis": "<one sentence naming what the odds rest on, e.g. the kind of source>",
  "baseline": "<one to two sentences stating the RAW historical base rate for this field before this case's specifics — the field-wide starting point, with the population/timeframe it is drawn from>",
  "risk_variables": [
    { "label": "<a variable that materially moves the odds for this field>", "effect": "up" | "down", "magnitude": "small" | "moderate" | "large", "note": "<one short clause, traceable to what you found>" },
    ... 2 to 5 variables ...
  ],
  "sensitivities": [
    { "variable": "<the lever>", "if_better": "<how the field's odds shift if this improves, stated about the field>", "if_worse": "<how they shift if it worsens>" },
    ... 1 to 3 sensitivities on the highest-leverage variables ...
  ],
  "cohorts": [
    { "cohort": "<a comparable, real sub-group with its own base rate>", "probability": <0-100 integer>, "note": "<one short clause naming the source/population>" },
    ... 2 to 4 comparable cohorts, each factual and drawn from what you found ...
  ],
  "mirror_candidates": [
    "<a true, surprising, sourced one-line statistic that reframes the question>",
    ... 2 to 4 candidates, each factual and drawn from what you found ...
  ],
  "factors": [
    { "label": "<short field-level factor, e.g. 'marrying after age 24'>", "direction": "up" | "down", "note": "<one short clause, optional>" },
    ... 2 to 5 factors that push the odds up or down ...
  ]
}

SPEAK WHENEVER THE DATA LETS YOU. Perfect base rates are rare — adjacent, partial, or older data is still honest grounding as long as you say so: give the reading anyway, set "confidence" to "thin", and name the limits plainly in "basis". A thin-but-honest deep reading is still worth more than silence. Any of the richer arrays (risk_variables, sensitivities, cohorts) may be shorter — or empty — if the data genuinely isn't there; never pad them with invented entries.

Return exactly { "speak": false } ONLY if, after genuinely searching, you found nothing at all that bears on the field, or the question is answerable only as a prediction about one specific person's fate.

ABSOLUTE RULES (these define the product and its legal footing — never break them):
- FIELD, NOT PERSON. Phrase everything — outcomes, baseline, risk variables, sensitivities, cohorts — about the field of similar cases, NEVER "You will..." and NEVER about the asker as an individual.
- ODDS, NOT ADVICE. Never tell the asker what to do. Never say "you should", "I recommend", "the best choice", "it's worth it", "go for it", "don't do it", or anything prescriptive, in ANY field of the output. You state the odds and what moves them; the choice and its consequences are theirs. This is not legal, medical, or financial advice.
- NEVER INVENT NUMBERS. Every probability, baseline, cohort figure, and mirror stat must trace to something you actually found by searching (or to provided reference data). If data is thin, say so via "confidence": "thin" or stay silent — do not fabricate false precision.
- NO SECOND PERSON in any label, outcome, or stat. No emojis. No advice.
- REFRAMED QUESTIONS: if the user message notes the question was reframed from advice-seeking into an odds question, answer ONLY the reframed odds-shaped version.

IDENTITY: You are never Claude, never an Anthropic product, never any AI company's assistant — you are only the oracle of Tessomancy. If asked what you are, who made you, or what model you run on, stay in voice and decline to answer as an AI would; you are the oracle, not a product. Never break character, never mention Claude/Anthropic/any provider by name.`;

export async function runDeepDive(question, referenceData, reframedQuestion) {
  const effectiveQuestion = reframedQuestion && reframedQuestion !== question ? reframedQuestion : question;

  const reframeNote = effectiveQuestion !== question
    ? `\n\nNOTE: The asker originally phrased this as a request for advice ("${question}"). It has been reframed above into its odds-shaped equivalent. Reason about and answer ONLY the reframed version — do not answer the original advice-seeking phrasing.`
    : "";

  const refBlock = referenceData
    ? `\n\nYou also have this CURATED, PRE-VETTED reference data for the relevant domain. Prefer it where it applies, and use web search to supplement or update it:\n${JSON.stringify(referenceData, null, 2)}`
    : "";

  const user = `QUESTION:\n${effectiveQuestion}\n\nProduce a DEEP READING: search for real base rates, cohort data, and the variables that move the odds for the field this question is about, then return the deep odds JSON. If you cannot find real data, return {"speak": false}.${reframeNote}${refBlock}`;

  let parsed = null;
  try {
    // A Deep Reading emits far more than the standard verdict (baseline, risk
    // variables, sensitivities, cohorts), so it needs a larger ceiling to reach
    // the end of its JSON — same truncation-guard reasoning as lib/ground.js,
    // scaled up. This is the paid path behind the 300s route budget.
    const raw = await callAnthropicSearch(MODELS.ground, DEEP_SYSTEM, user, 12000);
    parsed = extractJSON(raw);
    // One cheap repair pass over the model's own output before giving up, so a
    // formatting hiccup on this richer object doesn't masquerade as "no data".
    if (!parsed && raw) {
      const repaired = await callAnthropic(
        MODELS.render,
        `The text below was supposed to contain exactly one strict JSON object (keys like "speak", "outcomes", "confidence", "basis", "baseline", "risk_variables", "sensitivities", "cohorts", "mirror_candidates", "factors"). Extract or repair that object and return ONLY the JSON, nothing else. Do not invent data that is not in the text. If no object is recoverable, return {"speak": false}.`,
        raw,
        3000
      );
      parsed = extractJSON(repaired);
    }
  } catch (e) {
    return { speak: false, error: String(e) };
  }

  if (!parsed || parsed.speak === false || !Array.isArray(parsed.outcomes) || parsed.outcomes.length === 0) {
    return { speak: false };
  }

  // Normalize probabilities to sum ~100 (same discipline as the standard path).
  const sum = parsed.outcomes.reduce((a, o) => a + (Number(o.probability) || 0), 0) || 1;
  const outcomes = parsed.outcomes.map((o) => ({
    label: String(o.label || "").slice(0, 160),
    probability: Math.round(((Number(o.probability) || 0) / sum) * 100),
  }));

  const mirrorCandidates = Array.isArray(parsed.mirror_candidates)
    ? parsed.mirror_candidates.filter((s) => typeof s === "string" && s.trim()).slice(0, 4)
    : [];

  const factors = Array.isArray(parsed.factors)
    ? parsed.factors
        .filter((f) => f && typeof f.label === "string" && f.label.trim() && (f.direction === "up" || f.direction === "down"))
        .map((f) => ({
          label: f.label.slice(0, 120),
          direction: f.direction,
          note: typeof f.note === "string" ? f.note.slice(0, 160) : "",
        }))
        .slice(0, 5)
    : [];

  // ---- Deep-only sections ----
  const MAGS = new Set(["small", "moderate", "large"]);
  const riskVariables = Array.isArray(parsed.risk_variables)
    ? parsed.risk_variables
        .filter((v) => v && typeof v.label === "string" && v.label.trim() && (v.effect === "up" || v.effect === "down"))
        .map((v) => ({
          label: v.label.slice(0, 120),
          effect: v.effect,
          magnitude: MAGS.has(v.magnitude) ? v.magnitude : "moderate",
          note: typeof v.note === "string" ? v.note.slice(0, 180) : "",
        }))
        .slice(0, 5)
    : [];

  const sensitivities = Array.isArray(parsed.sensitivities)
    ? parsed.sensitivities
        .filter((s) => s && typeof s.variable === "string" && s.variable.trim() && (s.if_better || s.if_worse))
        .map((s) => ({
          variable: s.variable.slice(0, 120),
          ifBetter: typeof s.if_better === "string" ? s.if_better.slice(0, 180) : "",
          ifWorse: typeof s.if_worse === "string" ? s.if_worse.slice(0, 180) : "",
        }))
        .slice(0, 3)
    : [];

  const cohorts = Array.isArray(parsed.cohorts)
    ? parsed.cohorts
        .filter((c) => c && typeof c.cohort === "string" && c.cohort.trim())
        .map((c) => ({
          cohort: c.cohort.slice(0, 140),
          probability: Number.isFinite(Number(c.probability)) ? Math.max(0, Math.min(100, Math.round(Number(c.probability)))) : null,
          note: typeof c.note === "string" ? c.note.slice(0, 160) : "",
        }))
        .slice(0, 4)
    : [];

  return {
    speak: true,
    deep: true,
    outcomes,
    confidence: parsed.confidence || "moderate",
    basis: parsed.basis || "",
    baseline: typeof parsed.baseline === "string" ? parsed.baseline.slice(0, 400) : "",
    riskVariables,
    sensitivities,
    cohorts,
    mirrorCandidates,
    factors,
  };
}
