// Model selection by role. Each role uses the cheapest model that does its job well.
// The expensive brain (Sonnet) only fires once per SPOKEN verdict, behind the cheap gate.

export const MODELS = {
  // Cheap classifier: runs on EVERY question. Keep it small.
  gate: "grok-3-mini",
  // Live pulse / freshness: Grok's edge. (Legacy — the grounded path below
  // now uses real web search instead; kept for the curated-only fallback.)
  pulse: "grok-2-latest",
  // The reasoning workhorse: weighs findings against memory, produces honest odds.
  // (Legacy — dead code, see lib/reason.js; not on the live request path.)
  reason: "claude-sonnet-4-5",
  // The middle oracle (PRIMARY): an NVIDIA-hosted reasoning agent that produces
  // the odds from its own knowledge of published base rates plus the curated
  // reference data. Plain chat completions, same shape as the Gate/Render calls
  // that already work — no fragile server-side search tool in the hot path.
  // See lib/ground.js (OracleAgent) and callNvidia below.
  groundAgent: "nvidia/llama-3.3-nemotron-super-49b-v1",
  // The middle oracle (FALLBACK): xAI Grok with live web search. Only fires
  // when the NVIDIA agent can't ground a question, to reach for fresh sources.
  // Must be a model with live web search support (see callXAISearch below).
  ground: "grok-3",
  // Cheap phrasing: renders the verdict + Mirror.
  render: "grok-3-mini",
  // Background-only: buckets a question into anonymous analytics coordinates
  // (lib/insightsExtract.js). Deliberately kept on Claude/Anthropic — never
  // repoint this to MODELS.gate, or Grok model IDs get sent to Anthropic's
  // endpoint and this background call fails silently every time.
  insightsExtract: "claude-haiku-4-5-20251001",
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

// ---- Anthropic with live web search ----
// Same Messages API, but with the server-side web_search tool enabled so the
// model grounds its answer in real, current sources (Anthropic runs the search
// on its own infrastructure — no extra network egress from us). Handles the
// server-tool `pause_turn` loop and returns the concatenated final text.
export async function callAnthropicSearch(model, system, user, maxTokens = 1024, maxUses = 5) {
  let messages = [{ role: "user", content: user }];

  for (let hop = 0; hop < 4; hop++) {
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
        messages,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxUses }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Anthropic(search) ${res.status}: ${t}`);
    }
    const data = await res.json();

    // The server tool loop may pause after several searches; resume by
    // re-sending the assistant turn (no extra user message — the API detects
    // the trailing server_tool_use and continues).
    if (data.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: data.content }];
      continue;
    }

    return (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }
  // Exhausted resume hops — return whatever text we can from a final plain call.
  return "";
}

// ---- NVIDIA (build.nvidia.com / NIM) ----
// NVIDIA hosts models behind an OpenAI-compatible chat completions endpoint —
// the exact same request shape as callGrok, just a different base URL and key.
// This is the "copy what already works" path: no server-side search tool, no
// pause/resume loop, one request in, one answer out. Reasoning-tuned models
// (e.g. Nemotron) may wrap their scratch work in <think>...</think> before the
// final answer; extractJSON strips that, and we ask for thinking off besides.
export async function callNvidia(model, system, user, maxTokens = 2500) {
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [
        // Nemotron reads "detailed thinking on/off" from a leading system line
        // to toggle its reasoning trace; harmless to other NVIDIA models.
        { role: "system", content: `detailed thinking off\n\n${system}` },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`NVIDIA ${res.status}: ${t}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
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

// ---- Grok (xAI) with live web search ----
// Same chat completions endpoint as callGrok, with xAI's Live Search enabled
// via `search_parameters` so the model grounds its answer in real, current
// sources. Unlike Anthropic's server-tool, this is a single request/response
// — xAI runs the search server-side and returns one complete answer, no
// pause/resume loop needed.
export async function callXAISearch(model, system, user, maxTokens = 2500, searchParams = {}) {
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
      search_parameters: { mode: "on", return_citations: true, max_search_results: 15, ...searchParams },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`xAI(search) ${res.status}: ${t}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

// Safe JSON extraction from a model response that may wrap JSON in prose/fences.
export function extractJSON(text) {
  if (!text) return null;
  // Reasoning models can emit a <think>...</think> scratch block (which may
  // itself contain braces) before the real answer — drop it before we hunt
  // for the JSON object, or its braces derail the outermost-brace scan below.
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  t = t.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}
