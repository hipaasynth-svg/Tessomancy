// Standalone end-to-end smoke test for the answer pipeline.
//
// Runs the REAL pipeline functions (runGate -> runGroundedReason -> runRender)
// exactly as app/api/verdict/route.js does, minus the billing/access layer,
// and prints the verdict JSON for a spread of realistic questions across
// domains. Needs ANTHROPIC_API_KEY in the environment.
//
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/smoke-pipeline.mjs
//
// Not wired into the app or CI — a hand-run verification aid.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runGate } from "../lib/gate.js";
import { runGroundedReason } from "../lib/ground.js";
import { runRender } from "../lib/render.js";

const relationships = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/relationships.json", import.meta.url)), "utf8")
);
const CURATED = { relationships };

const QUESTIONS = [
  "Should I stay in a marriage where we've grown distant after 12 years together?",
  "What are the odds I'll be glad I left my stable job to join an early-stage startup?",
  "I'm 58 and just got diagnosed with early-stage prostate cancer — what happens to people like me?",
  "We're thinking of buying a house at the top of our budget with a 6.5% mortgage. Are we making a mistake?",
  "My partner and I have been together 2 years and are talking about marriage — will it last?",
];

async function runOne(question) {
  const gate = await runGate(question);
  if (gate.decision !== "SPEAK") {
    return { status: gate.decision === "BLOCK" ? "wall" : "silent", stage: "gate", gate };
  }
  const referenceData = CURATED[gate.topic] || null;
  const grounded = await runGroundedReason(question, referenceData, gate.reframedQuestion);
  if (!grounded.speak) {
    return { status: "silent", stage: "ground", gate, groundedError: grounded.error || null };
  }
  const face = await runRender(grounded.outcomes, grounded.mirrorCandidates);
  return {
    status: "spoken",
    understoodQuestion: gate.reframedQuestion || question,
    headline: face.headline,
    outcomes: grounded.outcomes,
    confidence: grounded.confidence,
    basis: grounded.basis,
    factors: grounded.factors || [],
    mirror: face.mirror,
  };
}

for (const q of QUESTIONS) {
  process.stdout.write(`\n\n================ QUESTION ================\n${q}\n`);
  const started = Date.now();
  try {
    const result = await runOne(q);
    process.stdout.write(`---------------- RESPONSE (${((Date.now() - started) / 1000).toFixed(1)}s) ----------------\n`);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (e) {
    process.stdout.write(`ERROR (${((Date.now() - started) / 1000).toFixed(1)}s): ${e?.stack || e}\n`);
  }
}
