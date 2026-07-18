import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { db } from "./insightsDb.js";
import { redis } from "./redis.js";

// Insights API keys are a separate credential system from the oracle's own
// billing (lib/access.js / Stripe customers) — different product, different
// customers, no overlap.

export const TIER_RATE_LIMITS = {
  basic: 60, // requests / hour
  pro: 600,
  enterprise: 6000,
};

function hashKey(plaintext) {
  return createHash("sha256").update(plaintext).digest("hex");
}

// Mints a new key. Returns the plaintext ONCE — only its hash is ever stored.
export async function createApiKey({ customerName, tier }) {
  const rateLimit = TIER_RATE_LIMITS[tier];
  if (!rateLimit) {
    throw new Error(`Unknown tier: ${tier}. Expected one of ${Object.keys(TIER_RATE_LIMITS).join(", ")}.`);
  }
  const plaintext = `tsi_live_${randomBytes(24).toString("hex")}`;
  const keyHash = hashKey(plaintext);
  const keyPrefix = plaintext.slice(0, 16);

  await db().query(
    `INSERT INTO api_keys (key_hash, key_prefix, customer_name, tier, rate_limit_per_hour)
     VALUES ($1, $2, $3, $4, $5)`,
    [keyHash, keyPrefix, customerName, tier, rateLimit]
  );

  return { key: plaintext, prefix: keyPrefix, tier, rateLimitPerHour: rateLimit };
}

// Returns the matching active key row, or null.
export async function validateApiKey(plaintext) {
  if (!plaintext) return null;
  const keyHash = hashKey(plaintext);
  const { rows } = await db().query(
    `SELECT id, customer_name, tier, rate_limit_per_hour FROM api_keys WHERE key_hash = $1 AND active = true`,
    [keyHash]
  );
  return rows[0] || null;
}

// Fixed-window rate limit per key, per hour, tracked in the same Upstash
// Redis instance the billing layer already uses.
export async function checkRateLimit(apiKeyId, limitPerHour) {
  const bucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const key = `insights_rl:${apiKeyId}:${bucket}`;
  const count = await redis().incr(key);
  if (count === 1) {
    await redis().expire(key, 3600);
  }
  return { allowed: count <= limitPerHour, remaining: Math.max(0, limitPerHour - count) };
}

export function isValidAdminToken(headerValue) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !headerValue) return false;
  const provided = headerValue.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
