import { createPromoCode } from "../../../lib/promo.js";

export const runtime = "nodejs";

// Owner-only: mint a promo code without a deploy. Requires ADMIN_SECRET to be
// set in the environment; the route is disabled (500) if it isn't, so it
// can never be silently wide open.
export async function POST(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return json({ status: "error", message: "Admin access is not configured." }, 500);
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ status: "error", message: "Unauthorized." }, 401);
  }

  try {
    const body = await req.json();
    const record = await createPromoCode(body);
    return json({ status: "ok", code: String(body.code || "").trim().toUpperCase(), record });
  } catch (e) {
    return json({ status: "error", message: "Could not create code.", detail: String(e) }, 400);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
