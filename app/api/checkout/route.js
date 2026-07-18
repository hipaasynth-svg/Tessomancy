import { stripe } from "../../../lib/stripe.js";
import { TIERS } from "../../../lib/tiers.js";
import { getCustomerId, setCustomerId } from "../../../lib/access.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { tier: tierKey } = await req.json();
    const tier = TIERS[tierKey];
    if (!tier) {
      return json({ status: "error", message: "Unknown pricing tier." }, 400);
    }

    const s = stripe();
    let customerId = getCustomerId();
    if (!customerId) {
      const customer = await s.customers.create({});
      customerId = customer.id;
      setCustomerId(customerId);
    }

    const origin = new URL(req.url).origin;
    const priceData = {
      currency: tier.currency,
      unit_amount: tier.amount,
      product_data: { name: tier.name },
      ...(tier.mode === "subscription" ? { recurring: { interval: tier.interval } } : {}),
    };

    const session = await s.checkout.sessions.create({
      mode: tier.mode,
      customer: customerId,
      line_items: [{ price_data: priceData, quantity: 1 }],
      metadata: { tier: tier.key, verdicts: String(tier.verdicts || "") },
      success_url: `${origin}/?purchase=success&tier=${tier.key}`,
      cancel_url: `${origin}/?purchase=cancel`,
    });

    return json({ status: "ok", url: session.url });
  } catch (e) {
    return json({ status: "error", message: "Could not start checkout.", detail: String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
