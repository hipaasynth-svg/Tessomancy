import { getOrCreateDeviceToken, getCustomerId, getAccessStatus } from "../../../lib/access.js";

export const runtime = "nodejs";

export async function GET() {
  try {
    const deviceToken = getOrCreateDeviceToken();
    const customerId = getCustomerId();
    const status = await getAccessStatus({ deviceToken, customerId });
    return json(status);
  } catch (e) {
    return json({ status: "error", message: "Could not read billing status.", detail: String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
