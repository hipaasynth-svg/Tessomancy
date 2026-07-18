import { waitUntil } from "@vercel/functions";
import { runGate } from "../../../lib/gate.js";
import { runEyes } from "../../../lib/eyes.js";
import { runReason } from "../../../lib/reason.js";
import { runRender } from "../../../lib/render.js";
import relationships from "../../../data/relationships.json";
import { getOrCreateDeviceToken, getCustomerId, checkAndConsumeAccess, publicTiers } from "../../../lib/access.js";
import { HARD_CAP_MESSAGE } from "../../../lib/tiers.js";
import { logBlocked, logSilent, logSpoken, coarseRegionFromHeaders } from "../../../lib/insightsLog.js";
import { extractCoordinates } from "../../../lib/insightsExtract.js";

export const runtime = "nodejs";
export const maxDuration = 30;

const MEMORY = { relationships };

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
    const { question, domain = "relationships" } = await req.json();

    if (!question || question.trim().length < 3) {
      return json({ status: "error", message: "Ask a real question." }, 400);
    }
    const mem = MEMORY[domain];
    if (!mem) {
      return json({ status: "silent", reason: "The oracle holds no memory of that domain yet." });
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
      return json({ status: "paywall", tiers: publicTiers() });
    }

    // 1) THE GATE — cheap, first, always. Enforces walls + speak/silent.
    const gate = await runGate(question, domain);

    if (gate.decision === "BLOCK") {
      waitUntil(logBlocked({ domain, wallType: gate.wall, region }));
      return json({
        status: "wall",
        wall: gate.wall,
        message: WALL_RESPONSES[gate.wall] || WALL_RESPONSES.harm_to_others,
      });
    }
    if (gate.decision === "STAY_SILENT") {
      waitUntil(logSilent({ domain, region }));
      return json({
        status: "silent",
        reason:
          gate.reason ||
          "The world hasn't shown the oracle enough to speak to this. She answers the field, not the fate of one person.",
      });
    }

    // 2) THE EYES — live pulse (non-fatal if it fails).
    const eyes = await runEyes(question, domain);

    // 3) REASON — the real odds, grounded in memory. (Sonnet)
    const ranked = await runReason(question, domain, mem, eyes.findings);
    if (!ranked) {
      waitUntil(logSilent({ domain, region }));
      return json({
        status: "silent",
        reason: "The oracle looked, but could not form honest odds from what she holds.",
      });
    }

    // 4) RENDER + MIRROR — cheap phrasing, true mirror stat.
    const face = await runRender(ranked.outcomes, mem.mirror_stats);

    // Question Insights logging, in the background: extracting coordinates is
    // an extra small LLM call, so it only runs for spoken verdicts (silent/
    // blocked stay near-free, per the pipeline's cost design). It never feeds
    // back into the response above, and never sees anything beyond `question`.
    waitUntil(
      (async () => {
        try {
          const coordinates = await extractCoordinates(question, domain);
          await logSpoken({ domain, coordinates, outcomes: ranked.outcomes, confidence: ranked.confidence, region });
        } catch (e) {
          console.error("insights logging failed (non-fatal)", e);
        }
      })()
    );

    return json({
      status: "spoken",
      headline: face.headline,
      outcomes: ranked.outcomes,
      confidence: ranked.confidence,
      basis: ranked.basis,
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
