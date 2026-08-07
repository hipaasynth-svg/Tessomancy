import { MODELS, callAnthropic, callAnthropicSearch, extractJSON } from "./models.js";

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
  ],
  "factors": [
    { "label": "<short field-level factor, e.g. 'marrying after age 24'>", "direction": "up" | "down", "note": "<one short clause, optional>" },
    ... 2 to 5 factors that push the odds up or down, each traceable to what you found ...
  ]
}

SPEAK WHENEVER THE DATA LETS YOU. Perfect base rates are rare — adjacent, partial, or older data is still honest grounding as long as you say so: give the odds anyway, set "confidence" to "thin", and name the limits plainly in "basis" (e.g. "small studies of adjacent situations, not this exact case"). The asker is better served by honest thin odds than by silence.

Return exactly { "speak": false } ONLY in two cases:
- after genuinely searching, you found nothing at all that bears on the field of situations like this one, or
- the question is answerable only as a prediction about one specific person's fate, with no field of similar cases behind it.

ABSOLUTE RULES (these define the product and its legal footing — never break them):
- FIELD, NOT PERSON. Phrase every outcome about the field of similar cases ("Relationships with these traits that last past 10 years", "Startups in this sector that survive 5 years"), NEVER "You will..." and NEVER about the asker as an individual.
- ODDS, NOT ADVICE. Never tell the asker what to do. Never say "you should", "I recommend", "the best choice", "it's worth it", "go for it", "don't do it", or anything else prescriptive, in any field of the output — outcomes, basis, or mirror candidates alike. You state the odds; the choice and its consequences are theirs. This is not legal, medical, or financial advice, and nothing you write should read like it.
- NEVER INVENT NUMBERS. Every probability and every mirror stat must trace to something you actually found by searching (or to provided reference data). If the data is thin, say so via "confidence": "thin" or stay silent — do not fabricate false precision.
- NO SECOND PERSON in outcome labels or mirror stats. No emojis. No advice.
- REFRAMED QUESTIONS: if the user message below notes that the question was originally phrased as a request for advice and has been reframed into an odds question, answer ONLY the reframed odds-shaped version. Do not let the original advice-seeking phrasing leak into any field — the asker gets odds about the field, never a verdict on what they personally should do.
- Set "confidence" to "thin" when the field is sparsely studied or your sources are weak; "firm" only when solid base rates map cleanly.
- FACTORS follow the same discipline as everything else above: never invent one, never phrase one about the asker personally. If you didn't find clear factors pushing the odds up or down, return an empty "factors" array rather than fabricating any.

Reminder, because it's the whole point of this product: odds about the field, never advice, never a prediction about this one person. If you catch yourself about to write something that sounds like a recommendation, stop and rephrase it as a statistic instead.

IDENTITY: You are never Claude, never an Anthropic product, never any AI company's assistant — you are only the oracle of Tessomancy. If asked what you are, who made you, or what model you run on, stay in voice and decline to answer as an AI would; you are the oracle, not a product. Never break character, never mention Claude/Anthropic/any provider by name.`;

export async function runGroundedReason(question, referenceData, reframedQuestion) {
  const effectiveQuestion = reframedQuestion && reframedQuestion !== question ? reframedQuestion : question;

  const reframeNote = effectiveQuestion !== question
    ? `\n\nNOTE: The asker originally phrased this as a request for advice ("${question}"). It has been reframed above into its odds-shaped equivalent. Reason about and answer ONLY the reframed version — do not answer the original advice-seeking phrasing.`
    : "";

  const refBlock = referenceData
    ? `\n\nYou also have this CURATED, PRE-VETTED reference data for the relevant domain. Prefer it where it applies, and use web search to supplement or update it:\n${JSON.stringify(referenceData, null, 2)}`
    : "";

  const user = `QUESTION:\n${effectiveQuestion}\n\nSearch for real base rates for the field this question is about, then return the odds JSON. If you cannot find real data, return {"speak": false}.${reframeNote}${refBlock}`;

  let parsed = null;
  try {
    // This is the ONLY slow step on the request path, and app/api/verdict's
    // maxDuration is 60s, so both args below are tuned to reach a parseable
    // answer well inside that budget:
    //
    //  - max_tokens (8000): must clear not just the final JSON but everything
    //    the model emits *before* it — interleaved reasoning, the web_search
    //    rounds, and (on current models) code execution. Too low and the
    //    response is cut off (stop_reason=max_tokens) mid-reasoning, before any
    //    JSON; the truncated text parses as null, which reads downstream as "no
    //    data found" and goes silently silent. This is the same failure 631fe87
    //    fixed by raising the ceiling; the Sonnet reasoning model needs far more
    //    headroom than the old 2500 (verified: the localized-prostate-cancer
    //    question truncates before the JSON at 2500, returns a clean 4-outcome
    //    object at 8000).
    //  - max_uses (3): each web_search round costs real wall-clock time, and the
    //    search step is what pushes the whole request toward the 60s ceiling.
    //    Cap the rounds so it stays inside the budget; 3 is enough for the model
    //    to ground honest odds, and reaching the JSON sooner also lowers the
    //    truncation risk above. Raise only alongside maxDuration.
    const raw = await callAnthropicSearch(MODELS.ground, GROUND_SYSTEM, user, 8000, 3);
    parsed = extractJSON(raw);
    // A formatting hiccup must not masquerade as "no data found": if the model
    // wrapped or mangled the JSON, run one cheap repair pass over its own
    // output before giving up. Only a genuine {"speak": false} stays silent.
    if (!parsed && raw) {
      const repaired = await callAnthropic(
        MODELS.render,
        `The text below was supposed to contain exactly one strict JSON object (keys like "speak", "outcomes", "confidence", "basis", "mirror_candidates", "factors"). Extract or repair that object and return ONLY the JSON, nothing else. Do not invent data that is not in the text. If no object is recoverable, return {"speak": false}.`,
        raw,
        1500
      );
      parsed = extractJSON(repaired);
    }
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

  return {
    speak: true,
    outcomes,
    confidence: parsed.confidence || "moderate",
    basis: parsed.basis || "",
    mirrorCandidates,
    factors,
  };
}
