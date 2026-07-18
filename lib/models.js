// Model selection by role. Each role uses the cheapest model that does its job well.
// The expensive brain (Sonnet) only fires once per SPOKEN verdict, behind the cheap gate.

export const MODELS = {
  // Cheap classifier: runs on EVERY question. Keep it small.
  gate: "claude-haiku-4-5-20251001",
  // Live pulse / freshness: Grok's edge.
  pulse: "grok-2-latest",
  // The reasoning workhorse: weighs findings against memory, produces honest odds.
  reason: "claude-sonnet-4-5",
  // Cheap phrasing: renders the verdict + Mirror.
  render: "claude-haiku-4-5-20251001",
};

// ---- Anthropic ----
export async function callAnthropic(model, system, user, maxTokens = 1024) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
}

// ---- Grok (xAI) ----
// xAI uses an OpenAI-compatible chat completions endpoint.
export async function callGrok(model, system, user, maxTokens = 512) {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.GROK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Grok ${res.status}: ${t}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

// Safe JSON extraction from a model response that may wrap JSON in prose/fences.
export function extractJSON(text) {
  if (!text) return null;
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}
