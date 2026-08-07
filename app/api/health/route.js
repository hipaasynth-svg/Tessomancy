import { MODELS, callAnthropic, callAnthropicSearch } from "../../../lib/models.js";
import { redis } from "../../../lib/redis.js";
import { stripe } from "../../../lib/stripe.js";
import { isValidAdminToken } from "../../../lib/apiKeys.js";

export const runtime = "nodejs";
// A real web-search round-trip can take a few seconds; give it headroom.
export const maxDuration = 60;

// Live-dependency health check. This route makes ONE real call through every
// external dependency the answer pipeline (app/api/verdict/route.js) depends
// on — the Anthropic gate/render call, the Anthropic web-search call, Redis,
// and Stripe — and reports pass/fail per dependency with the ACTUAL error.
//
// Why this exists: the whole pipeline once went silently dead for days because
// a provider retired an endpoint (xAI's Live Search, 410 Gone) and the only
// symptom was every question returning "silent." A provider-side deprecation
// must surface as a LOUD, SPECIFIC failure here within minutes of a deploy —
// hit this route (or point an uptime monitor at it) and read the JSON.
//
// It is guarded by ADMIN_TOKEN (the same credential the admin-promo route
// uses) because each run spends real Anthropic tokens. If ADMIN_TOKEN is not
// configured the check still runs, but says so — set one in production so the
// route can't be abused.

async function timed(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - started, detail };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - started, error: String(e?.message || e) };
  }
}

export async function GET(req) {
  const adminConfigured = Boolean(process.env.ADMIN_TOKEN);
  const authed = isValidAdminToken(req.headers.get("authorization"));
  if (adminConfigured && !authed) {
    return json({ status: "unauthorized", message: "Set an Authorization: Bearer <ADMIN_TOKEN> header." }, 401);
  }

  const checks = await Promise.all([
    // 1) Anthropic plain call — the gate/render/insights transport. A model-ID
    // deprecation or auth failure shows up here.
    timed("anthropic", async () => {
      const out = await callAnthropic(MODELS.gate, "Reply with the single word OK.", "ping", 16);
      return { model: MODELS.gate, reply: out.slice(0, 40) };
    }),
    // 2) Anthropic web-search call — the ground step's transport, and the exact
    // class of dependency whose deprecation caused the original outage. Force a
    // single real search so a retired/renamed web_search tool fails loudly.
    timed("anthropic_search", async () => {
      const out = await callAnthropicSearch(
        MODELS.ground,
        "Use the web_search tool exactly once, then reply with the single word OK.",
        "Search the web for anything, then reply OK.",
        256,
        1
      );
      return { model: MODELS.ground, reply: out.slice(0, 60) };
    }),
    // 3) Redis (Upstash) — billing/access + insights rate limiting.
    timed("redis", async () => {
      const pong = await redis().ping();
      return { pong };
    }),
    // 4) Stripe — subscription/paywall billing. Balance retrieve is a cheap
    // authenticated call that proves the key works.
    timed("stripe", async () => {
      const bal = await stripe().balance.retrieve();
      return { livemode: bal.livemode };
    }),
  ]);

  const allOk = checks.every((c) => c.ok);
  return json(
    {
      status: allOk ? "ok" : "degraded",
      authed: adminConfigured ? true : "no ADMIN_TOKEN set (route is unguarded)",
      checkedAt: new Date().toISOString(),
      checks,
    },
    allOk ? 200 : 503
  );
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
