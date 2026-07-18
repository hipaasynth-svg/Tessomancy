import { isValidAdminToken } from "../../../../lib/apiKeys.js";
import { getQuarterlyReport } from "../../../../lib/insightsReport.js";

export const runtime = "nodejs";

// Admin-only retrieval — quarterly reports are delivered to subscribers
// manually for v1 (the site owner fetches the generated report here, then
// sends it themselves), matching the manual-delivery approach in the spec.
export async function GET(req) {
  if (!isValidAdminToken(req.headers.get("authorization"))) {
    return json({ status: "error", message: "Unauthorized." }, 401);
  }
  const quarter = new URL(req.url).searchParams.get("quarter");
  if (!quarter) {
    return json({ status: "error", message: "Pass ?quarter=YYYY-Qn." }, 400);
  }
  const report = await getQuarterlyReport(quarter);
  if (!report) {
    return json({ status: "error", message: `No report stored for ${quarter}.` }, 404);
  }
  return json({ status: "ok", ...report });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
