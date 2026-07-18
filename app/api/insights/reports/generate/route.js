import { timingSafeEqual } from "crypto";
import { generateAndStoreQuarterlyReport } from "../../../../../lib/insightsReport.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fired by the Vercel Cron job configured in vercel.json, at the start of
// each quarter, to compile a report for the quarter that just ended.
// Protected the standard Vercel way: Vercel sends `Authorization: Bearer
// $CRON_SECRET` on cron-triggered requests when CRON_SECRET is set.
function isValidCronSecret(headerValue) {
  const expected = process.env.CRON_SECRET;
  if (!expected || !headerValue) return false;
  const provided = headerValue.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req) {
  if (!isValidCronSecret(req.headers.get("authorization"))) {
    return json({ status: "error", message: "Unauthorized." }, 401);
  }
  try {
    const report = await generateAndStoreQuarterlyReport();
    return json({ status: "ok", quarter: report.quarter });
  } catch (e) {
    return json({ status: "error", message: "Report generation failed.", detail: String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
