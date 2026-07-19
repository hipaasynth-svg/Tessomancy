import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { redis } from "./redis.js";
import { FREE_TASTE_WINDOW_SECONDS, SOFT_CAP, HARD_CAP, SOFT_CAP_NOTICE, TIERS } from "./tiers.js";
// === TEMPORARY DEV BYPASS FOR CODY TESTING - SET TO false WHEN DONE ===
const DEV_BYPASS = true; // <--- Change this to false after testing!!

if (DEV_BYPASS) {
  console.log("[DEV BYPASS] Unlimited access enabled for Cody");
  // Skip all paywall and balance checks
  return { 
    allowed: true, 
    reason: "dev_bypass", 
    remaining: Infinity 
  };
}
// ================================================================
const DEVICE_COOKIE = "tess_device";
const CUSTOMER_COOKIE = "tess_customer";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // ~13 months, the browser's own cap on Set-Cookie Max-Age

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: COOKIE_MAX_AGE,
};

const k = {
  freeTaste: (device) => `free:${device}`,
  balance: (customer) => `balance:${customer}`,
  sub: (customer) => `sub:${customer}`,
  usage: (customer) => `usage:${customer}`,
  unlimited: (customer) => `unlimited:${customer}`,
};

// Anonymous device token: powers the free-taste weekly limit only.
// Random id in an httpOnly cookie — no account, no personal data.
export function getOrCreateDeviceToken() {
  const jar = cookies();
  let token = jar.get(DEVICE_COOKIE)?.value;
  if (!token) {
    token = randomUUID();
    jar.set(DEVICE_COOKIE, token, cookieOpts);
  }
  return token;
}

export function getCustomerId() {
  return cookies().get(CUSTOMER_COOKIE)?.value || null;
}

export function setCustomerId(customerId) {
  cookies().set(CUSTOMER_COOKIE, customerId, cookieOpts);
}

export function publicTiers() {
  return Object.values(TIERS).map((t) => ({
    key: t.key,
    name: t.name,
    amount: t.amount,
    currency: t.currency,
    mode: t.mode,
    verdicts: t.verdicts || null,
  }));
}

// Days until the weekly free taste comes back, or null if it's available
// now (or there's nothing to count down — no device token).
export async function getFreeTasteResetsInDays(deviceToken) {
  if (!deviceToken) return null;
  const ttlSeconds = await redis().ttl(k.freeTaste(deviceToken));
  return ttlSeconds > 0 ? Math.ceil(ttlSeconds / 86400) : null;
}

// Read-only status for the UI: what access does this visitor currently have.
export async function getAccessStatus({ deviceToken, customerId }) {
  const r = redis();
  const freeUsedP = deviceToken ? r.get(k.freeTaste(deviceToken)) : null;
  const balanceP = customerId ? r.get(k.balance(customerId)) : null;
  const subP = customerId ? r.get(k.sub(customerId)) : null;
  const usageP = customerId ? r.get(k.usage(customerId)) : null;
  const unlimitedP = customerId ? r.get(k.unlimited(customerId)) : null;
  const [freeUsed, balance, sub, usage, unlimited] = await Promise.all([freeUsedP, balanceP, subP, usageP, unlimitedP]);

  const subscription =
    sub && sub.status === "active"
      ? {
          active: true,
          usageCount: usage?.count || 0,
          softCapped: (usage?.count || 0) >= SOFT_CAP,
          hardCapped: (usage?.count || 0) >= HARD_CAP,
          resetAt: sub.currentPeriodEnd,
        }
      : null;

  // Honest scarcity: surface exactly when the free taste comes back, rather
  // than just going quiet. Only meaningful once it's actually been used.
  const freeTasteResetsInDays = freeUsed ? await getFreeTasteResetsInDays(deviceToken) : null;

  return {
    freeTasteAvailable: !freeUsed,
    freeTasteResetsInDays,
    packBalance: Number(balance) || 0,
    subscription,
    unlimited: Boolean(unlimited),
    hasAccess: Boolean(unlimited || !freeUsed || Number(balance) > 0 || (subscription && !subscription.hardCapped)),
    tiers: publicTiers(),
  };
}

// Checks eligibility AND consumes the unit of access in the same call, so it can
// run BEFORE the Gate — an unpayable request never reaches the LLM pipeline.
// Priority: unlimited (promo) > active subscription (under hard cap) > pack balance > weekly free taste.
export async function checkAndConsumeAccess({ deviceToken, customerId }) {
  const r = redis();

  if (customerId) {
    const unlimited = await r.get(k.unlimited(customerId));
    if (unlimited) {
      return { allowed: true, source: "promo" };
    }

    const sub = await r.get(k.sub(customerId));
    if (sub && sub.status === "active") {
      const usage = (await r.get(k.usage(customerId))) || { count: 0, resetAt: sub.currentPeriodEnd };
      if (usage.count >= HARD_CAP) {
        return { allowed: false, hardCapped: true };
      }
      const nextCount = usage.count + 1;
      await r.set(k.usage(customerId), { ...usage, count: nextCount });
      return {
        allowed: true,
        source: "subscription",
        softCapNotice: nextCount > SOFT_CAP ? SOFT_CAP_NOTICE : null,
      };
    }

    const balance = Number(await r.get(k.balance(customerId))) || 0;
    if (balance > 0) {
      await r.decr(k.balance(customerId));
      return { allowed: true, source: "pack" };
    }
  }

  if (deviceToken) {
    const freeUsed = await r.get(k.freeTaste(deviceToken));
    if (!freeUsed) {
      await r.set(k.freeTaste(deviceToken), 1, { ex: FREE_TASTE_WINDOW_SECONDS });
      return { allowed: true, source: "free" };
    }
  }

  return { allowed: false, hardCapped: false };
}

// --- Webhook-side writers ---

export async function grantPackBalance(customerId, verdicts) {
  await redis().incrby(k.balance(customerId), verdicts);
}

// Promo-only: bypasses the paywall entirely for this customer, forever (no
// expiry, no per-period cap). Used for gift/press codes and the owner's own
// testing code — never granted by billing flows.
export async function grantUnlimitedAccess(customerId) {
  await redis().set(k.unlimited(customerId), 1);
}

export async function upsertSubscription(customerId, { status, currentPeriodStart, currentPeriodEnd }) {
  const r = redis();
  const existing = await r.get(k.sub(customerId));
  await r.set(k.sub(customerId), { status, currentPeriodStart, currentPeriodEnd });

  // Reset the usage counter only when the period actually rolled forward,
  // not on every subscription.updated (e.g. metadata edits, plan tweaks).
  const isNewPeriod = !existing || existing.currentPeriodStart !== currentPeriodStart;
  if (isNewPeriod) {
    await r.set(k.usage(customerId), { count: 0, resetAt: currentPeriodEnd });
  }
}

export async function deactivateSubscription(customerId) {
  const r = redis();
  const existing = await r.get(k.sub(customerId));
  await r.set(k.sub(customerId), { ...(existing || {}), status: "inactive" });
}
