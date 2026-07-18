import { MODELS, callAnthropic, extractJSON } from "./models.js";

// The reasoning + reconciliation step. Weighs the seed memory (real base rates)
// against the question and any live findings, and produces ranked outcomes with
// honest probabilities and a confidence/thinness label.
// This is the quality-critical step -> Sonnet. Temperature is effectively low
// via instruction (Anthropic default is fine; determinism is aided by strict format).

const REASON_SYSTEM = `You are the reasoning core of an oracle. You produce HONEST statistical odds for a FIELD of situations like the asker's — never a prediction about the asker as an individual, never advice.

You are given: (1) reference base-rate data for the domain, (2) the asker's question, (3) any live findings.

Produce STRICT JSON, no prose:
{
  "outcomes": [
    { "label": "<short outcome, phrased about the FIELD>", "probability": <0-100 integer> },
    ... 2 to 4 outcomes, probabilities summing to ~100 ...
  ],
  "confidence": "firm" | "moderate" | "thin",
  "basis": "<one sentence naming what the odds rest on>"
}

Rules:
- Ground every number in the provided base rates, adjusting sensibly for factors the question mentions. Do not invent precise figures beyond what the data supports.
- Phrase outcomes about the FIELD: "Relationships with these traits that last past 10 years", never "You will...".
- Set "confidence" to "thin" if the question gives little to go on or the data barely covers it; "firm" only when base rates map cleanly.
- Never output advice. Never predict the specific individual. Never reference the asker as "you" in outcome labels.`;

export async function runReason(question, domain, memory, findings) {
  const user = `DOMAIN: ${domain}

REFERENCE BASE-RATE DATA:
${JSON.stringify(memory, null, 2)}

LIVE FINDINGS:
${findings}

ASKER'S QUESTION:
${question}

Produce the ranked odds as strict JSON.`;

  const raw = await callAnthropic(MODELS.reason, REASON_SYSTEM, user, 700);
  const parsed = extractJSON(raw);
  if (!parsed || !Array.isArray(parsed.outcomes) || parsed.outcomes.length === 0) {
    return null;
  }
  // Normalize probabilities to sum ~100.
  const sum = parsed.outcomes.reduce((a, o) => a + (Number(o.probability) || 0), 0) || 1;
  parsed.outcomes = parsed.outcomes.map((o) => ({
    label: String(o.label || "").slice(0, 140),
    probability: Math.round(((Number(o.probability) || 0) / sum) * 100),
  }));
  parsed.confidence = parsed.confidence || "moderate";
  parsed.basis = parsed.basis || "";
  return parsed;
}
