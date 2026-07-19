# Tessomancy — the oracle

A mobile-first web app. You ask a high-stakes life question — about **any** domain (love, work, health, money, life events) — and it returns the **real statistical odds** for situations *like yours*, grounded in **live web search** for real published data, delivered as a short verdict. It is **not advice**, **not a wager**, and it **never predicts you specifically** — only the field you stand in. Anonymous: no account, no name; questions are remembered, people are not.

**Odds only, never advice — by design and for liability.** The oracle states the odds for the field; it never tells anyone what to do, never uses the second person in a verdict, and always carries the disclaimer. That guardrail is enforced in the grounded step's system prompt, not just convention.

---

## The pipeline (plus a paywall in front)

0. **Access** (`lib/access.js`) — runs before anything else, on every request, no LLM calls. Checks free-taste / pack balance / subscription cap and consumes the unit if eligible; if not, the request stops here with a paywall or a rest message. See "Payment & usage caps" below.
1. **The Gate** (`lib/gate.js`) — runs first in the actual pipeline, on every question that clears Access, cheaply (Claude Haiku). Enforces the three hard walls (self-harm, harm to others, minors → refuse), decides `SPEAK` vs `STAY_SILENT`, and emits a `topic` hint (a curated domain, or `general`). Domain-agnostic: it speaks for any field with real base-rate data, stays silent on the unknowable. Silence is a feature.
2. **Grounded Reason** (`lib/ground.js`) — the brain (Claude Sonnet 5 with the **live `web_search` server tool**). For any question that clears the Gate, it searches the web for real base rates for the field, then produces honest ranked odds + a confidence/thinness label, or stays silent if it can't find real data. It **never invents numbers**, and its system prompt hard-codes the odds-only / never-advice / field-not-person rules. When the Gate's topic maps to a curated domain, that domain's vetted reference data (below) is injected alongside the live search.
3. **Render + Mirror** (`lib/render.js`) — cheap phrasing (Haiku). Turns odds into a verdict card and picks **the Mirror**: one true, wry stat (chosen from the candidates the grounded step surfaced from real sources, never invented) that reframes the question.
4. **The Face** (`app/page.js`) — the mobile UI: ask box → verdict card, with honest silence and wall states.

**Curated reference data** lives in `data/<topic>.json`. The seed domain, `data/relationships.json`, cites base rates to specific named studies/researchers (Wolfinger's marriage-age research, Gottman's Four Horsemen, Kansas State's financial-conflict study, Stanford's HCMST project, IFS's cohabitation research, etc.), with explicit caveats where the research is mixed. It's injected into the grounded step as pre-vetted context *plus* live search, so relationship questions get the best of both. Every other question is answered from live search alone. To give a new domain curated grounding, add `data/<topic>.json`, register it in the route's `CURATED` map, and add the topic to the Gate's `topic` hint.

> **Legacy:** `lib/eyes.js` (Grok "pulse") and `lib/reason.js` (memory-only Sonnet) are the previous relationships-only path. The active pipeline is Gate → Grounded Reason → Render; those two files are retained but no longer on the request path.

## Cost shape
- Gate + render use a small model; the grounded brain (Sonnet 5 + web search) fires once per *spoken* verdict, behind the gate. Web search adds a per-search cost on top of tokens.
- A refused/silent question costs almost nothing (no search runs).
- Estimated compute per spoken verdict: single-digit-to-low-double-digit cents (web search is the new variable cost). The real cost enemy is still payment-processing flat fees — sell in packs, not single dollars.

---

## Run it locally

```bash
npm install
cp .env.local.example .env.local   # then paste your real keys
npm run dev                        # http://localhost:3000
```

You need these keys in `.env.local`:
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `GROK_API_KEY` — from console.x.ai
- `STRIPE_SECRET_KEY` — a **test-mode** secret key from dashboard.stripe.com
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — a free Redis database from upstash.com/redis
- `STRIPE_WEBHOOK_SECRET` — run `stripe listen --forward-to localhost:3000/api/webhook` (Stripe CLI) and copy the `whsec_...` it prints
- `DATABASE_URL` — a Postgres connection string (Neon, Supabase, or any Postgres), for Question Insights
- `ADMIN_TOKEN` / `CRON_SECRET` — two secrets you generate yourself (`openssl rand -hex 32`), for Question Insights

Once `DATABASE_URL` is set, create the Insights tables:
```bash
npm run db:init-insights
```

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **New Project → import the repo**.
3. Add a Redis database from the Vercel Marketplace ("Upstash") to the project — this sets `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` automatically — or create one yourself at upstash.com and add the two vars manually.
4. Add the remaining environment variables (`ANTHROPIC_API_KEY`, `GROK_API_KEY`, `STRIPE_SECRET_KEY`) in **Project Settings → Environment Variables**.
5. Deploy once so the `/api/webhook` URL exists, e.g. `https://your-app.vercel.app/api/webhook`.
6. In the Stripe Dashboard, add a webhook endpoint at that URL listening for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.
7. Flip `STRIPE_SECRET_KEY` and the webhook to live mode when you're ready to charge real cards.
8. Add a Postgres database from the Vercel Marketplace (or Neon/Supabase directly) and set `DATABASE_URL`. Run `npm run db:init-insights` once (locally, pointed at the production `DATABASE_URL`) to create the Insights tables.
9. Set `ADMIN_TOKEN` and `CRON_SECRET` in **Project Settings → Environment Variables** — both are secrets you generate yourself, not values Vercel or Stripe give you.
10. `vercel.json` already defines the quarterly report cron; Vercel picks it up automatically on deploy.

## Model choices (edit in `lib/models.js`)
- Gate / Render: `claude-haiku-4-5-20251001`
- Grounded Reason: `claude-sonnet-5` — must be a model that supports the `web_search_20260209` server tool
- Reason (legacy, unused): `claude-sonnet-4-5`
- Pulse (legacy, unused): `grok-2-latest`

If any model string is out of date, update it there — it's the single source of truth. Confirm current model names in each provider's docs. The grounded step uses Anthropic's server-side web search, so the search runs on Anthropic's infrastructure — no extra network egress or search-API key is needed here.

## The rules baked in (do not remove lightly)
- **Field, not person.** Never predicts the individual.
- **Odds, not advice.** Never says "you should."
- **Three walls.** Self-harm, harm to others, minors → no odds, ever.
- **Honest silence.** When the data is thin or the question is unanswerable, she says so.
- **The Mirror is true.** Sourced from memory, never fabricated.

## Payment & usage caps

Four tiers, defined in `lib/tiers.js` (the single source of truth for pricing):

| Tier | Price | Grants |
|---|---|---|
| Free taste | free | 1 verdict per anonymous device, per rolling 7 days |
| Single Pack | $2.99 | 3 verdicts (consumed as a balance) |
| Standard Pack | $6.99 | 10 verdicts (consumed as a balance) |
| Monthly Subscription | $9.99/mo | unlimited within fair use (see caps below) |

**Identity, without accounts.** An httpOnly `tess_device` cookie (random id) tracks the free-taste window. Once someone buys a pack or subscribes, a Stripe Customer is created and its id is stored in a second httpOnly `tess_customer` cookie — that id, a pack balance, and a rolling usage counter (keyed in Upstash Redis) are the *only* things stored server-side. No names or emails beyond whatever Stripe itself collects for the transaction.

**Usage caps (subscription only — packs and free taste aren't capped, they just run out):**
- **Soft cap, 50 verdicts/period:** not blocked — the verdict still renders normally, with an in-character line above it ("The oracle has spoken generously with you this month; she grows quiet toward the renewal.").
- **Hard cap, 100 verdicts/period:** the pipeline doesn't run at all — no Gate, no Eyes, no Reason, no LLM calls of any kind. Just a static in-character line ("She rests until the turning of the month."). This is an abuse backstop, not a normal-use limit.
- The counter resets when Stripe reports the subscription's billing period has rolled over (`customer.subscription.updated`), not on a fixed calendar date.

**Ordering, for margin:** `app/api/verdict/route.js` checks and consumes access *before* the Gate fires. A request with no free taste, no pack balance, and no active (non-hard-capped) subscription never reaches an LLM — it gets a paywall response instead. This is additive in front of the existing pipeline; the Gate, the three hard walls, field-not-person/odds-not-advice, and the Mirror are unchanged.

Checkout is Stripe Checkout (hosted), not custom card forms — `app/api/checkout/route.js` creates the session, `app/api/webhook/route.js` grants pack balances and tracks subscription status/period from Stripe's events, and `app/api/portal/route.js` opens Stripe's hosted Customer Portal for subscribers to self-manage or cancel.

## Question Insights — a second product

A separate, B2B, aggregate-only data product built from the questions flowing through the oracle. It does not change the oracle's behavior, pricing, or public API in any way — it's a read of what already happens in the pipeline, stored in its own Postgres tables (`lib/insightsSchema.sql`), sold through its own routes, to its own customers.

**What gets logged, per verdict (`lib/insightsLog.js`, called from `app/api/verdict/route.js` via `waitUntil` so it never adds latency):**
- domain, the Gate's decision (`SPEAK`/`STAY_SILENT`/`BLOCK`) and wall type if blocked
- for spoken verdicts only: a small set of coarse, bucketed **coordinates** (age range, prior marriages, cohabitation, etc. — see `lib/insightsExtract.js`), the ranked outcomes, and the confidence label
- a coarse region (country, or country + state, from Vercel's geo headers — never an IP)
- a timestamp truncated to the hour

**What never gets logged, anywhere:** the free-text question itself, an IP address, a device fingerprint, or any billing/device identifier (`tess_device`/`tess_customer`). A row in `insight_events` cannot be linked back to a specific asker or to their oracle billing status.

**Coordinates are extracted by a *separate* step, not the real pipeline.** The oracle's intake is free text — there's no structured form. `lib/insightsExtract.js` runs one extra, cheap (Haiku) LLM call, *only for spoken verdicts*, whose sole job is turning the question into a handful of enum-only bucket values (defined per domain in `DOMAIN_SCHEMAS`) for logging. It never feeds back into Gate/Eyes/Reason/Render, and every value is validated against a hard whitelist server-side — the free text itself is never returned or stored. Silent/blocked questions are logged without this extra call, so refusals stay near-free per the pipeline's existing cost design.

**Aggregation floor (`lib/insights.js`):** every statistic — in both delivery formats below — passes through this one module, and any slice built from fewer than `MIN_AGGREGATE_THRESHOLD` (20) underlying records comes back `suppressed: true` instead of a real number. This applies per-bucket, not just to the overall query, so a lopsided breakdown can't leak a small slice by hiding inside a large total.

**Two delivery formats, two different customers:**
1. **Real-time feed** — `GET /api/insights/feed?metric=...&domain=...`, authenticated via an `x-api-key` header, rate-limited per tier (`basic`/`pro`/`enterprise`, see `lib/apiKeys.js`) using the same Upstash Redis as billing. Metrics: `domain_volume`, `volume_trend`, `gate_decision_breakdown`, `confidence_breakdown`, `coordinate_distribution`.
2. **Quarterly report** — a Vercel Cron job (`vercel.json`) hits `POST /api/insights/reports/generate` at the start of each quarter, compiling a Markdown report for the quarter that just ended (`lib/insightsReport.js`) and storing it. `GET /api/insights/reports?quarter=2026-Q2` (admin-only) retrieves it for manual delivery to report subscribers — there's no automated email step yet.

**Provisioning is manual for v1** (no self-serve signup): mint a customer's API key with
```bash
curl -X POST https://your-app.vercel.app/api/insights/keys \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"customerName":"Acme Data Co","tier":"pro"}'
```
The plaintext key is shown exactly once — only its hash is stored.

## Any question, and curated domains

Any question is answerable out of the box — the grounded step searches live for whatever field the question is about, and stays honestly silent when it can't find real data. You don't need to add anything for a new topic to work.

Adding **curated** grounding for a domain (vetted reference data injected alongside live search) is optional and makes that domain's answers stronger:
1. Add `data/<topic>.json` (any shape — it's passed to the model as JSON context; the relationships file's `baselines`/`factors`/`mirror_stats` shape is a good template).
2. Register it in `app/api/verdict/route.js`'s `CURATED` map, keyed by topic.
3. Add the topic to the Gate's `topic` hint in `lib/gate.js` so questions route to it.
4. Optional: add a matching entry to `DOMAIN_SCHEMAS` in `lib/insightsExtract.js` so Insights can bucket that domain's coordinates too (Insights degrades gracefully — no coordinates — for domains without a schema).
