import Stripe from "stripe";

let client = null;

export function stripe() {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  client = new Stripe(key, { apiVersion: "2024-06-20" });
  return client;
}
