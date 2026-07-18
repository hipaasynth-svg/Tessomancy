import { isValidAdminToken, createApiKey, TIER_RATE_LIMITS } from "../../../../lib/apiKeys.js";

export const runtime = "nodejs";

// Admin-only key minting for v1 — Insights customers are provisioned
// manually (no self-serve signup yet), matching quarterly reports also being
// delivered manually. Set ADMIN_TOKEN to a long random secret you keep private.
export async function POST(req) {
  if (!isValidAdminToken(req.headers.get("authorization"))) {
    return json({ status: "error", message: "Unauthorized." }, 401);
  }
  try {
    const { customerName, tier } = await req.json();
    if (!customerName || !TIER_RATE_LIMITS[tier]) {
      return json(
        { status: "error", message: `customerName and a valid tier (${Object.keys(TIER_RATE_LIMITS).join(", ")}) are required.` },
        400
      );
    }
    const created = await createApiKey({ customerName, tier });
    return json({ status: "ok", ...created, notice: "Store this key now — it will not be shown again." });
  } catch (e) {
    return json({ status: "error", message: "Could not create API key.", detail: String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
