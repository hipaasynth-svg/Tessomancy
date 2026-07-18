import { Redis } from "@upstash/redis";

let client = null;

// Lazily constructed so a missing env var only breaks the billing path,
// not the whole app (e.g. `next build`, or the free/no-billing pipeline).
export function redis() {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Upstash Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).");
  }
  client = new Redis({ url, token });
  return client;
}
