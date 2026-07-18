// One-time (idempotent) schema setup for the Insights product.
// Run with: node scripts/init-insights-db.js
// Requires DATABASE_URL in the environment (e.g. `dotenv -e .env.local -- node scripts/init-insights-db.js`).
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { db } from "../lib/insightsDb.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(join(__dirname, "../lib/insightsSchema.sql"), "utf8");
  await db().query(sql);
  console.log("Insights schema is up to date.");
  await db().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
