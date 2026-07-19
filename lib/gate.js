// lib/gate.js - Cost-optimized + helpful rephrasing
const CHEAP_MODEL = "claude-haiku-4-5-20251001"; // or even rule-based

const ADVICE_PATTERNS = [/should i/i, /what should/i, /what do i do/i, /tell me if/i, /advice/i, /is it worth/i];

function isClearlyUnanswerable(q) {
  return /future predict|exact date|will i definitely/i.test(q);
}

function rephraseToOdds(question) {
  let cleaned = question.trim();
  if (ADVICE_PATTERNS.some(p => p.test(cleaned))) {
    cleaned = cleaned
      .replace(/should i|what should i do|tell me if|is it worth/i, "What are the statistical odds and base rates for")
      .replace(/^will i /i, "What are the odds that someone in my situation will ");
  }
  return cleaned;
}

export async function evaluateGate(userQuestion) {
  const lower = userQuestion.toLowerCase().trim();

  // Hard safety walls - first, cheapest check
  if (isHarmful(lower)) {
    return { decision: "BLOCK", reason: "safety", message: "The Oracle stays silent on harm." };
  }

  if (isClearlyUnanswerable(lower)) {
    return { decision: "SILENT", message: "Odds are too uncertain for a meaningful answer." };
  }

  const cleanedQuery = rephraseToOdds(userQuestion);
  const wasRephrased = cleanedQuery !== userQuestion;
  const topicHint = detectTopic(cleanedQuery || userQuestion);

  return {
    decision: "SPEAK",
    cleanedQuery,
    originalQuery: userQuestion,
    topicHint,
    wasRephrased,
    message: wasRephrased ? "Rephrased into statistical odds for the field." : null,
    // Cost metadata for logging
    estimatedCostTier: "low" // Haiku gate only
  };
}
