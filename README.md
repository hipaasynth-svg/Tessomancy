# Tessomancy — the oracle

A mobile-first web app. You ask a high-stakes life question; it returns the **real statistical odds** for situations *like yours* — grounded in actual data, delivered as a short verdict. It is **not advice**, **not a wager**, and it **never predicts you specifically** — only the field you stand in. Anonymous: no account, no name; questions are remembered, people are not.

First seed domain: **relationships / marriage outcomes.**

---

## The pipeline (five parts)

1. **The Gate** (`lib/gate.js`) — runs first, on every question, cheaply (Claude Haiku). Enforces the three hard walls (self-harm, harm to others, minors → refuse) and decides `SPEAK` vs `STAY_SILENT`. Silence is a feature.
2. **The Eyes** (`lib/eyes.js`) — a light live-pulse read via **Grok** for current signal. Non-fatal if it fails.
3. **Reason + Reconcile** (`lib/reason.js`) — the quality-critical step (Claude Sonnet). Weighs the seed memory's real base rates against the question, produces honest ranked odds + a confidence/thinness label. Fires only *after* the gate says SPEAK.
4. **Render + Mirror** (`lib/render.js`) — cheap phrasing (Haiku). Turns odds into a verdict card and picks **the Mirror**: one true, wry stat (chosen from the memory's `mirror_stats`, never invented) that reframes the question.
5. **The Face** (`app/page.js`) — the mobile UI: ask box → verdict card, with honest silence and wall states.

Memory lives in `data/relationships.json` — real, sourced base rates. This is the moat: the odds are only worth anything if they're honest.

## Cost shape
- Gate + render use a small model; the expensive brain (Sonnet) fires once per *spoken* verdict, behind the gate.
- A refused/silent question costs almost nothing.
- Estimated compute per spoken verdict: single-digit cents. The real cost enemy is payment-processing flat fees — sell in packs, not single dollars.

---

## Run it locally

```bash
npm install
cp .env.local.example .env.local   # then paste your real keys
npm run dev                        # http://localhost:3000
```

You need two keys in `.env.local`:
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `GROK_API_KEY` — from console.x.ai

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **New Project → import the repo**.
3. Add the two environment variables (`ANTHROPIC_API_KEY`, `GROK_API_KEY`) in **Project Settings → Environment Variables**.
4. Deploy. That's it — the API route runs as a serverless function.

## Model choices (edit in `lib/models.js`)
- Gate / Render: `claude-haiku-4-5-20251001`
- Reason: `claude-sonnet-4-5`
- Pulse: `grok-2-latest`

If any model string is out of date, update it there — it's the single source of truth. Confirm current model names in each provider's docs.

## The rules baked in (do not remove lightly)
- **Field, not person.** Never predicts the individual.
- **Odds, not advice.** Never says "you should."
- **Three walls.** Self-harm, harm to others, minors → no odds, ever.
- **Honest silence.** When the data is thin or the question is unanswerable, she says so.
- **The Mirror is true.** Sourced from memory, never fabricated.

## Payment (not built yet)
The MVP has no paywall — it's for testing whether the verdict *lands*. When ready, gate the full verdict behind a small pack purchase (e.g. 5 for $3) to beat processing flat fees; keep a cheap free taste for virality.

## Next domains
Add a new `data/<domain>.json` in the same shape (`baselines`, `factors`, `mirror_stats`) and register it in `app/api/verdict/route.js`'s `MEMORY` map. The gate already handles unknown domains gracefully.
