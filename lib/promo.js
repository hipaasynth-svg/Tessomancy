import { redis } from "./redis.js";
import { grantPackBalance, grantUnlimitedAccess } from "./access.js";

// Promo codes: a single mechanism for two needs — marketing/gift codes that
// grant a handful of verdicts, and an "unlimited" code (for the owner, press,
// testers) that bypasses the paywall entirely on whatever device redeems it.
// Codes live in Redis so they can be minted without a deploy, via the
// admin-only /api/admin-promo route.

const k = {
  code: (code) => `promo:${code.trim().toUpperCase()}`,
  redeemed: (code, customerId) => `promoredeemed:${code.trim().toUpperCase()}:${customerId}`,
};

export async function createPromoCode({ code, verdicts = 0, unlimited = false, maxRedemptions = null, expiresInDays = null }) {
  if (!code || !code.trim()) throw new Error("code is required");
  const record = {
    verdicts: Number(verdicts) || 0,
    unlimited: !!unlimited,
    maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
    redemptions: 0,
  };
  await redis().set(k.code(code), record, expiresInDays ? { ex: Number(expiresInDays) * 86400 } : undefined);
  return record;
}

export async function redeemPromoCode(code, customerId) {
  if (!code || !code.trim()) return { ok: false, error: "Enter a code." };
  const r = redis();
  const codeKey = k.code(code);
  const promo = await r.get(codeKey);
  if (!promo) return { ok: false, error: "That code isn't valid." };
  if (promo.maxRedemptions && promo.redemptions >= promo.maxRedemptions) {
    return { ok: false, error: "That code has already been fully redeemed." };
  }

  const redeemedKey = k.redeemed(code, customerId);
  const already = await r.get(redeemedKey);
  if (already) return { ok: false, error: "You've already redeemed this code." };

  if (promo.unlimited) {
    await grantUnlimitedAccess(customerId);
  } else if (promo.verdicts > 0) {
    await grantPackBalance(customerId, promo.verdicts);
  } else {
    return { ok: false, error: "That code doesn't grant anything." };
  }

  await r.set(redeemedKey, 1);
  await r.set(codeKey, { ...promo, redemptions: promo.redemptions + 1 });
  return { ok: true, unlimited: !!promo.unlimited, verdicts: promo.verdicts || 0 };
}
