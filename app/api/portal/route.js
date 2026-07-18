import { stripe } from "../../../lib/stripe.js";
import { getCustomerId } from "../../../lib/access.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const customerId = getCustomerId();
    if (!customerId) {
      return json({ status: "error", message: "No subscription found for this device." }, 400);
    }
    const origin = new URL(req.url).origin;
    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/`,
    });
    return json({ status: "ok", url: session.url });
  } catch (e) {
    return json({ status: "error", message: "Could not open the billing portal.", detail: String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
