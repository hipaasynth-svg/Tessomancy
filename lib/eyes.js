import { MODELS, callGrok } from "./models.js";

// The Eyes: NOT a live data feed. This is a plain chat-completion call asking
// Grok to recall "widely-known, current" facts from its own training — there
// is no search/tool-use wired up here, so "current" only means whatever's in
// the model's training data, not anything fetched live. For the relationships
// domain, base rates are stable (data/relationships.json), so this is used
// lightly regardless. Kept small and cheap; failure is non-fatal.

const EYES_SYSTEM = `You are a research scout for an oracle that answers with statistical base rates.
Given a question, briefly note any widely-known, current, relevant facts or figures that would help ground a base-rate answer.
Be terse. 2-3 sentences max. State only well-established facts. If you have nothing solid to add, say "No additional signal." Never give advice or predict the individual.`;

export async function runEyes(question, domain) {
  try {
    const findings = await callGrok(
      MODELS.pulse,
      EYES_SYSTEM,
      `Domain: ${domain}\nQuestion: ${question}`,
      300
    );
    return { ok: true, findings };
  } catch (e) {
    return { ok: false, findings: "No additional signal.", error: String(e) };
  }
}
