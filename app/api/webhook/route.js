import { stripe } from "../../../lib/stripe.js";
import { grantPackBalance, upsertSubscription, deactivateSubscription } from "../../../lib/access.js";

export const runtime = "nodejs";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function POST(req) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const body = await req.text();

  let event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return new Response(`Webhook signature verification failed: ${e.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "payment" && session.customer) {
          const verdicts = Number(session.metadata?.verdicts) || 0;
          if (verdicts > 0) {
            await grantPackBalance(session.customer, verdicts);
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        await upsertSubscription(sub.customer, {
          status: ACTIVE_STATUSES.has(sub.status) ? "active" : "inactive",
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await deactivateSubscription(sub.customer);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Signature already verified; a processing error should not make Stripe
    // retry forever, but we do want it visible in logs.
    console.error("Stripe webhook handler error", event.type, e);
    return new Response("Webhook handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
