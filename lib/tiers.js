// Single source of truth for pricing tiers and usage caps.
// Amounts are in US cents (Stripe convention).

export const TIERS = {
  single: {
    key: "single",
    name: "Single Pack",
    verdicts: 3,
    amount: 299,
    currency: "usd",
    mode: "payment",
  },
  standard: {
    key: "standard",
    name: "Standard Pack",
    verdicts: 10,
    amount: 699,
    currency: "usd",
    mode: "payment",
  },
  subscription: {
    key: "subscription",
    name: "Monthly Subscription",
    amount: 999,
    currency: "usd",
    mode: "subscription",
    interval: "month",
  },
};

export const FREE_TASTE_WINDOW_SECONDS = 7 * 24 * 60 * 60;

// A Deep Reading (the premium multi-factor synthesis) costs this many verdict
// credits instead of one. It is a paid-only upgrade: it never draws on the
// weekly free taste, only on a pack balance or an active subscription.
export const DEEP_READING_UNITS = 2;

// Usage capping applies only to the monthly subscription (not packs, not free taste).
export const SOFT_CAP = 50;
export const HARD_CAP = 100;

export const SOFT_CAP_NOTICE =
  "The oracle has spoken generously with you this month; she grows quiet toward the renewal.";

export const HARD_CAP_MESSAGE = "She rests until the turning of the month.";
