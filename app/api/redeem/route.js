import { stripe } from "../../../lib/stripe.js";
import { getCustomerId, setCustomerId, getOrCreateDeviceToken, getAccessStatus } from "../../../lib/access.js";
import { redeemPromoCode } from "../../../lib/promo.js";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return json({ status: "error", message: "Enter a code." }, 400);
    }

    let customerId = getCustomerId();
    if (!customerId) {
      const customer = await stripe().customers.create({});
      customerId = customer.id;
      setCustomerId(customerId);
    }

    const result = await redeemPromoCode(code, customerId);
    if (!result.ok) {
      return json({ status: "error", message: result.error }, 400);
    }

    const deviceToken = getOrCreateDeviceToken();
    const billing = await getAccessStatus({ deviceToken, customerId });
    return json({ status: "ok", billing });
  } catch (e) {
    return json({ status: "error", message: "Could not redeem that code.", detail: String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
