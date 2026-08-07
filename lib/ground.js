import { MODELS, callGrok, callNvidia, callXAISearch, extractJSON } from "./models.js";

// The middle oracle — grounded reasoning — modelled as a small agent object.
//
// For ANY question that clears the Gate, it produces honest ranked odds for the
// FIELD of situations like the asker's. It runs in two tiers:
//
//   1. PRIMARY — an NVIDIA-hosted reasoning model (MODELS.groundAgent). It
//      reasons from well-established published base rates it already knows plus
//      the curated, pre-vetted reference data injected for the domain. This is
//      a plain chat completion — the same call shape as the Gate and Render,
//      which is the part of the pipeline that already works reliably.
//   2. FALLBACK — xAI Grok with live web search (MODELS.ground). Only fires
//      when the primary agent errors or can't ground the question, to reach for
//      fresh, searchable sources before the oracle gives up and stays silent.
//
// The liability guardrail is load-bearing and identical across both tiers and
// the curated path: odds about the FIELD only, never a prediction about the
// individual, never "you should", never advice. Breaking that is what turns a
// probabilistic reading into legal exposure. It never invents numbers; when its
// grounding is thin it says so via "confidence", or stays silent.

// Shared rules and output contract for both tiers. The only thing that differs
// between tiers is HOW they get their grounding (knowledge vs. live search),
// spliced in as {{GROUNDING}} below.
const SYSTEM_TEMPLATE = `You are the reasoning core of an oracle. For a high-stakes life question, you produce HONEST statistical odds for the FIELD of situations like the asker's.

{{GROUNDING}}

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
- you know of nothing at all that bears on the field of situations like this one, or
- the question is answerable only as a prediction about one specific person's fate, with no field of similar cases behind it.

ABSOLUTE RULES (these define the product and its legal footing — never break them):
- FIELD, NOT PERSON. Phrase every outcome about the field of similar cases ("Relationships with these traits that last past 10 years", "Startups in this sector that survive 5 years"), NEVER "You will..." and NEVER about the asker as an individual.
- ODDS, NOT ADVICE. Never tell the asker what to do. Never say "you should", "I recommend", "the best choice", "it's worth it", "go for it", "don't do it", or anything else prescriptive, in any field of the output — outcomes, basis, or mirror candidates alike. You state the odds; the choice and its consequences are theirs. This is not legal, medical, or financial advice, and nothing you write should read like it.
- NEVER INVENT NUMBERS. Every probability and every mirror stat must trace to a real base rate — one you genuinely know, or one in the provided reference data, or one you found by searching. If the data is thin, say so via "confidence": "thin" or stay silent — do not fabricate false precision.
- NO SECOND PERSON in outcome labels or mirror stats. No emojis. No advice.
- REFRAMED QUESTIONS: if the user message below notes that the question was originally phrased as a request for advice and has been reframed into an odds question, answer ONLY the reframed odds-shaped version. Do not let the original advice-seeking phrasing leak into any field — the asker gets odds about the field, never a verdict on what they personally should do.
- Set "confidence" to "thin" when the field is sparsely studied or your grounding is weak; "firm" only when solid base rates map cleanly.
- FACTORS follow the same discipline as everything else above: never invent one, never phrase one about the asker personally. If you didn't find clear factors pushing the odds up or down, return an empty "factors" array rather than fabricating any.

Reminder, because it's the whole point of this product: odds about the field, never advice, never a prediction about this one person. If you catch yourself about to write something that sounds like a recommendation, stop and rephrase it as a statistic instead.

IDENTITY: You are never Grok, never NVIDIA, never Nemotron, never Llama, never an xAI or NVIDIA or any AI company's product or assistant — you are only the oracle of Tessomancy. If asked what you are, who made you, or what model you run on, stay in voice and decline to answer as an AI would; you are the oracle, not a product. Never break character, never mention Grok/xAI/NVIDIA/Anthropic/any provider or model by name.`;

// PRIMARY (NVIDIA): reasons from its own knowledge + curated reference data.
// No search tool available on this endpoint, so lean on well-established base
// rates and say so honestly when the grounding is general rather than a study.
const NVIDIA_GROUNDING = `Draw the odds from well-established, published base rates for the FIELD this question is about — the kind of statistics found in demographic research, actuarial tables, large studies, and official records — together with any curated reference data provided below. Ground every number in a real base rate you actually know or that the reference data gives you. When you are relying on general knowledge rather than a specific named study, keep "confidence" at "moderate" or "thin" and say so plainly in "basis". Do not fabricate precision you don't have.`;

// FALLBACK (xAI): has a live web_search tool — instruct it to use it.
const SEARCH_GROUNDING = `You have a web_search tool. USE IT: search for real base rates, published statistics, and research findings that bear on the question's field. Ground every number in what you actually find.`;

const NVIDIA_SYSTEM = SYSTEM_TEMPLATE.replace("{{GROUNDING}}", NVIDIA_GROUNDING);
const SEARCH_SYSTEM = SYSTEM_TEMPLATE.replace("{{GROUNDING}}", SEARCH_GROUNDING);

class OracleAgent {
  constructor({ primaryModel, fallbackModel } = {}) {
    this.primaryModel = primaryModel || MODELS.groundAgent; // NVIDIA
    this.fallbackModel = fallbackModel || MODELS.ground; // xAI + search
  }

  // Build the user turn. `withSearchHint` tweaks the final instruction line so
  // the search-capable fallback is told to search; the primary is not.
  buildUser(question, referenceData, reframedQuestion, withSearchHint) {
    const effectiveQuestion =
      reframedQuestion && reframedQuestion !== question ? reframedQuestion : question;

    const reframeNote =
      effectiveQuestion !== question
        ? `\n\nNOTE: The asker originally phrased this as a request for advice ("${question}"). It has been reframed above into its odds-shaped equivalent. Reason about and answer ONLY the reframed version — do not answer the original advice-seeking phrasing.`
        : "";

    const refBlock = referenceData
      ? `\n\nYou also have this CURATED, PRE-VETTED reference data for the relevant domain. Prefer it where it applies, and supplement it with your own knowledge of the field's base rates:\n${JSON.stringify(
          referenceData,
          null,
          2
        )}`
      : "";

    const closing = withSearchHint
      ? `Search for real base rates for the field this question is about, then return the odds JSON. If you cannot find real data, return {"speak": false}.`
      : `Give the odds JSON for the field this question is about, grounded in real base rates you know and any reference data below. If there is genuinely no field of similar cases with real base rates behind it, return {"speak": false}.`;

    return `QUESTION:\n${effectiveQuestion}\n\n${closing}${reframeNote}${refBlock}`;
  }

  // Turn a model's raw text into a validated, normalized result, running one
  // cheap JSON-repair pass over the model's own output before giving up — a
  // formatting hiccup must not masquerade as "no data found".
  async parse(raw) {
    let parsed = extractJSON(raw);
    if (!parsed && raw) {
      const repaired = await callGrok(
        MODELS.render,
        `The text below was supposed to contain exactly one strict JSON object (keys like "speak", "outcomes", "confidence", "basis", "mirror_candidates", "factors"). Extract or repair that object and return ONLY the JSON, nothing else. Do not invent data that is not in the text. If no object is recoverable, return {"speak": false}.`,
        raw,
        1500
      );
      parsed = extractJSON(repaired);
    }
    return parsed;
  }

  // A parsed object counts as "spoken" only if it affirmatively speaks with a
  // non-empty outcomes array. Anything else means try the next tier / stay silent.
  static spoke(parsed) {
    return !!(
      parsed &&
      parsed.speak !== false &&
      Array.isArray(parsed.outcomes) &&
      parsed.outcomes.length > 0
    );
  }

  static normalize(parsed) {
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
          .filter(
            (f) =>
              f &&
              typeof f.label === "string" &&
              f.label.trim() &&
              (f.direction === "up" || f.direction === "down")
          )
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

  // PRIMARY tier: NVIDIA reasoning agent, knowledge + curated data, no search.
  async askPrimary(question, referenceData, reframedQuestion) {
    const user = this.buildUser(question, referenceData, reframedQuestion, false);
    const raw = await callNvidia(this.primaryModel, NVIDIA_SYSTEM, user, 2500);
    return this.parse(raw);
  }

  // FALLBACK tier: xAI Grok with live web search.
  async askFallback(question, referenceData, reframedQuestion) {
    const user = this.buildUser(question, referenceData, reframedQuestion, true);
    const raw = await callXAISearch(this.fallbackModel, SEARCH_SYSTEM, user, 2500);
    return this.parse(raw);
  }

  // Run the middle oracle: try the primary agent, and only if it errors or
  // can't ground the question, reach for the live-search fallback. Stay silent
  // only when BOTH tiers decline — that's a genuine "no honest odds" result.
  async reason(question, referenceData, reframedQuestion) {
    let lastError = null;

    try {
      const parsed = await this.askPrimary(question, referenceData, reframedQuestion);
      if (OracleAgent.spoke(parsed)) return OracleAgent.normalize(parsed);
    } catch (e) {
      lastError = e;
      // Non-fatal: the primary agent is down or errored — fall through to search.
    }

    try {
      const parsed = await this.askFallback(question, referenceData, reframedQuestion);
      if (OracleAgent.spoke(parsed)) return OracleAgent.normalize(parsed);
    } catch (e) {
      lastError = e;
    }

    // Both tiers declined (or errored). This question can't be answered honestly now.
    return lastError ? { speak: false, error: String(lastError) } : { speak: false };
  }
}

// A single shared agent instance for the request path.
export const oracleAgent = new OracleAgent();

// Public entry point — unchanged signature, so the route needs no changes.
export async function runGroundedReason(question, referenceData, reframedQuestion) {
  return oracleAgent.reason(question, referenceData, reframedQuestion);
}
