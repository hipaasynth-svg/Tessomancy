import { MODELS, callAnthropic, extractJSON } from "./models.js";

// The Render + Mirror. Cheap model. Turns ranked odds into a verdict card:
// a headline, the ranked field, and THE MIRROR — one true, wry, sourced stat
// that reframes the question. The Mirror is drawn from the memory's mirror_stats
// so it stays factual and is never invented freehand.

const RENDER_SYSTEM = `You are the voice of an oracle. You phrase a verdict from given ranked odds. You are calm, certain about the odds, and you never address the asker as a person you know. You never advise. You state the field.

You are given ranked outcomes and a list of TRUE candidate "mirror" statistics. Return STRICT JSON, no prose:
{
  "headline": "<the single most striking outcome as a short line, e.g. 'Relationships like this reach ten years about 6 in 10 times.'>",
  "mirror": "<choose the ONE candidate mirror stat that best reframes this question; copy it faithfully, lightly edited only for flow. Never invent a new stat.>"
}

Rules:
- The headline states the top outcome plainly, about the field, never "you".
- The mirror MUST be one of the provided candidates, kept factual. Do not fabricate.
- Tone: quiet, knowing, weighty. No emojis. No advice. No second person.`;

export async function runRender(outcomes, mirrorStats) {
  const user = `RANKED OUTCOMES:
${JSON.stringify(outcomes, null, 2)}

CANDIDATE MIRROR STATS (choose one, keep it true):
${mirrorStats.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Return the verdict JSON.`;

  let parsed = null;
  try {
    const raw = await callAnthropic(MODELS.render, RENDER_SYSTEM, user, 300);
    parsed = extractJSON(raw);
  } catch {
    parsed = null;
  }
  // Fallbacks keep the card honest even if the render call hiccups.
  const top = outcomes[0];
  return {
    headline: parsed?.headline || `${top.label}: about ${top.probability}%.`,
    mirror: parsed?.mirror || mirrorStats[0] || "",
  };
}
