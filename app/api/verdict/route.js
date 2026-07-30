import { waitUntil } from "@vercel/functions";
import { runGate } from "../../../lib/gate.js";
import { runGroundedReason } from "../../../lib/ground.js";
import { runRender } from "../../../lib/render.js";
import relationships from "../../../data/relationships.json";
import {
  getOrCreateDeviceToken,
  getCustomerId,
  checkAndConsumeAccess,
  refundAccess,
  publicTiers,
  getFreeTasteResetsInDays,
} from "../../../lib/access.js";
import { HARD_CAP_MESSAGE } from "../../../lib/tiers.js";
import { logBlocked, logSilent, logSpoken, coarseRegionFromHeaders } from "../../../lib/insightsLog.js";
import { extractCoordinates } from "../../../lib/insightsExtract.js";

export const runtime = "nodejs";
// Web search + reasoning can take longer than a plain LLM call.
export const maxDuration = 60;

// Curated, pre-vetted reference data by topic. When the Gate routes a question
// to one of these, the data is injected into the grounded step as trusted
// context alongside live web search. Everything else is answered from search
// alone. Add a new topic here (and register it in the Gate's topic hint) to
// give a domain curated grounding.
const CURATED = { relationships };

const DISCLAIMER =
  "A probabilistic reading of outcomes, not advice — not legal, medical, or financial guidance. The choice, and its consequences, are yours.";

const WALL_RESPONSES = {
  self_harm:
    "This one I won't read as odds. If you're thinking about harming yourself, please talk to someone now — in the US you can call or text 988, any time. You deserve a real person, not a verdict.",
  harm_to_others:
    "This isn't a question I'll answer. I read the odds of things that happen to people, not plans to harm them.",
  minor:
    "I won't answer this. Questions that predict or involve a specific child are off the board, always.",
};

export async function POST(req) {
  try {
    const { question } = await req.json();

    if (!question || question.trim().length < 3) {
      return json({ status: "error", message: "Ask a real question." }, 400);
    }

    // Question Insights: a separate, aggregate-only product. Region is the
    // only thing read from the request for it — coarse (country/state),
    // never an IP address. Logging never touches billing/device identity.
    const region = coarseRegionFromHeaders(req.headers);

    // 0) ACCESS — balance/subscription check, BEFORE the Gate fires. Protects
    // margin: an unpayable request never reaches the LLM pipeline below.
    const deviceToken = getOrCreateDeviceToken();
    const customerId = getCustomerId();
    const access = await checkAndConsumeAccess({ deviceToken, customerId });

    if (!access.allowed) {
      if (access.hardCapped) {
        return json({ status: "rested", message: HARD_CAP_MESSAGE });
      }
      const freeTasteResetsInDays = await getFreeTasteResetsInDays(deviceToken);
      return json({ status: "paywall", tiers: publicTiers(), freeTasteResetsInDays });
    }

    // 1) THE GATE — cheap, first, always. Enforces walls + speak/silent, and
    // hints which curated domain (if any) the question belongs to.
    const gate = await runGate(question);
    const domain = gate.topic; // "relationships" | "general" — used for logging + curated routing

    // No verdict means no charge: every non-spoken exit below refunds the
    // unit of access consumed above, before responding. Nobody spends their
    // one free weekly reading — or a paid verdict — on silence.
    if (gate.decision === "BLOCK") {
      await refundAccess(access, { deviceToken, customerId });
      waitUntil(logBlocked({ domain, wallType: gate.wall, region }));
      return json({
        status: "wall",
        wall: gate.wall,
        message: WALL_RESPONSES[gate.wall] || WALL_RESPONSES.harm_to_others,
      });
    }
    if (gate.decision === "STAY_SILENT") {
      await refundAccess(access, { deviceToken, customerId });
      waitUntil(logSilent({ domain, region }));
      return json({
        status: "silent",
        reason:
          gate.reason ||
          "The world hasn't shown the oracle enough to speak to this. She answers the field, not the fate of one person.",
        hint: "She reads fields, not fates. Describe the situation — ages, timelines, the kind of decision — rather than one person's name, and ask again. This reading cost you nothing.",
      });
    }

    // 2) GROUNDED REASON — live web search for real base rates for ANY field,
    // plus curated reference data when the topic has it. Produces honest odds
    // grounded in real sources, or stays silent if it can't find any. Odds
    // about the field only — never advice, never about the individual.
    const referenceData = CURATED[domain] || null;
    const grounded = await runGroundedReason(question, referenceData, gate.reframedQuestion);

    if (!grounded.speak) {
      // Surface WHY in the server logs — silence caused by an API error or a
      // parse failure must be distinguishable from a genuine lack of data.
      if (grounded.error) {
        console.error("grounded reason failed (returned silent)", grounded.error);
      }
      await refundAccess(access, { deviceToken, customerId });
      waitUntil(logSilent({ domain, region }));
      return json({
        status: "silent",
        reason: "The oracle looked — searched the world for real numbers on this — but could not find honest odds to stand behind.",
        hint: "Try widening it to the field: 'what are the odds that couples/startups/patients like this…' rather than a single person's outcome. This reading cost you nothing.",
      });
    }

    // 3) RENDER + MIRROR — cheap phrasing, one true mirror stat drawn from the
    // real facts the grounded step surfaced.
    const face = await runRender(grounded.outcomes, grounded.mirrorCandidates);

    // Question Insights logging, in the background: extracting coordinates is
    // an extra small LLM call, so it only runs for spoken verdicts (silent/
    // blocked stay near-free). It never feeds back into the response above,
    // never sees anything beyond `question`, and degrades to no coordinates
    // for domains without a schema.
    waitUntil(
      (async () => {
        try {
          const coordinates = await extractCoordinates(question, domain);
          await logSpoken({ domain, coordinates, outcomes: grounded.outcomes, confidence: grounded.confidence, region });
        } catch (e) {
          console.error("insights logging failed (non-fatal)", e);
        }
      })()
    );

    return json({
      status: "spoken",
      understoodQuestion: gate.reframedQuestion || question,
      headline: face.headline,
      outcomes: grounded.outcomes,
      confidence: grounded.confidence,
      basis: grounded.basis,
      factors: grounded.factors || [],
      mirror: face.mirror,
      disclaimer: DISCLAIMER,
      softCapNotice: access.softCapNotice || null,
    });
  } catch (e) {
    return json({ status: "error", message: "The oracle went quiet unexpectedly.", detail: String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
