import { validateApiKey, checkRateLimit } from "../../../../lib/apiKeys.js";
import {
  domainVolume,
  volumeTrend,
  gateDecisionBreakdown,
  confidenceBreakdown,
  coordinateDistribution,
  availableCoordinateFields,
} from "../../../../lib/insights.js";

export const runtime = "nodejs";

// The Insights real-time feed — entirely separate product/surface from the
// oracle's public /api/verdict. Requires a paid API key (x-api-key header)
// and is rate-limited per customer tier. Every metric below is an aggregate
// from lib/insights.js, which enforces the minimum-record floor itself.

const METRICS = {
  domain_volume: (p) => domainVolume({ sinceDays: p.sinceDays }),
  volume_trend: (p) => volumeTrend({ domain: p.domain, periodDays: p.periodDays }),
  gate_decision_breakdown: (p) => gateDecisionBreakdown({ domain: p.domain, sinceDays: p.sinceDays }),
  confidence_breakdown: (p) => confidenceBreakdown({ domain: p.domain, sinceDays: p.sinceDays }),
  coordinate_distribution: (p) => coordinateDistribution({ domain: p.domain, field: p.field, sinceDays: p.sinceDays }),
};

export async function GET(req) {
  const apiKey = req.headers.get("x-api-key");
  const keyRow = await validateApiKey(apiKey).catch(() => null);
  if (!keyRow) {
    return json({ status: "error", message: "Missing or invalid API key." }, 401);
  }

  const rate = await checkRateLimit(keyRow.id, keyRow.rate_limit_per_hour);
  if (!rate.allowed) {
    return json({ status: "error", message: "Rate limit exceeded for your tier." }, 429, {
      "retry-after": "3600",
    });
  }

  const url = new URL(req.url);
  const metric = url.searchParams.get("metric");
  const fn = METRICS[metric];
  if (!fn) {
    return json(
      {
        status: "error",
        message: `Unknown metric. One of: ${Object.keys(METRICS).join(", ")}.`,
        coordinateFields: availableCoordinateFields(),
      },
      400
    );
  }

  const params = {
    domain: url.searchParams.get("domain") || "relationships",
    field: url.searchParams.get("field"),
    sinceDays: numOr(url.searchParams.get("sinceDays"), undefined),
    periodDays: numOr(url.searchParams.get("periodDays"), undefined),
  };

  try {
    const result = await fn(params);
    return json({ status: "ok", metric, rateLimitRemaining: rate.remaining, result });
  } catch (e) {
    return json({ status: "error", message: "Could not compute that metric.", detail: String(e) }, 400);
  }
}

function numOr(v, fallback) {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : fallback;
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}
