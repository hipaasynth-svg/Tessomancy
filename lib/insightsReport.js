import { db } from "./insightsDb.js";
import {
  activeDomains,
  domainVolume,
  gateDecisionBreakdown,
  confidenceBreakdown,
  coordinateDistribution,
  availableCoordinateFields,
} from "./insights.js";

function quarterOf(date) {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

// The quarter immediately before `referenceDate`'s quarter — i.e. "the
// quarter that just ended" as seen from the start of the next one.
export function previousQuarterRange(referenceDate = new Date()) {
  let year = referenceDate.getUTCFullYear();
  let q = quarterOf(referenceDate) - 1;
  if (q === 0) {
    q = 4;
    year -= 1;
  }
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, startMonth + 3, 1, 0, 0, 0));
  return { label: `${year}-Q${q}`, start, end };
}

function fmtCount(stat) {
  return stat.suppressed ? "— (insufficient data)" : String(stat.n);
}

function fmtBreakdown(breakdown) {
  if (breakdown.suppressed) return `- insufficient data (${breakdown.n} total records)\n`;
  return Object.entries(breakdown.breakdown)
    .map(([key, stat]) => `- **${key}**: ${fmtCount(stat)}${!stat.suppressed ? ` (${Math.round((stat.n / breakdown.n) * 100)}%)` : ""}`)
    .join("\n");
}

async function compileDomainSection(domain, range) {
  const [decisions, confidence] = await Promise.all([
    gateDecisionBreakdown({ domain, since: range.start, until: range.end }),
    confidenceBreakdown({ domain, since: range.start, until: range.end }),
  ]);

  const coordinateSections = [];
  for (const field of availableCoordinateFields()) {
    const dist = await coordinateDistribution({ domain, field, since: range.start, until: range.end });
    if (!dist.suppressed) {
      coordinateSections.push(`#### ${field}\n${fmtBreakdown(dist)}`);
    }
  }

  return `### ${domain}

**Volume by decision** (n=${decisions.n})
${fmtBreakdown(decisions)}

**Confidence, spoken verdicts** (n=${confidence.n})
${fmtBreakdown(confidence)}

${coordinateSections.length ? `**Coordinate distributions**\n\n${coordinateSections.join("\n\n")}` : ""}`;
}

export async function compileQuarterlyReport(referenceDate = new Date()) {
  const range = previousQuarterRange(referenceDate);
  const domains = await activeDomains({ since: range.start, until: range.end });
  const volume = await domainVolume({ since: range.start, until: range.end });

  const domainSections = domains.length
    ? await Promise.all(domains.map((d) => compileDomainSection(d, range)))
    : [];

  const content = `# Tessomancy Question Insights — ${range.label}

Generated ${new Date().toISOString()}. Every statistic below is an aggregate over anonymous, structured question data — no individual asker is identifiable, and any slice under 20 underlying records is withheld.

## Volume by domain

${fmtBreakdown({ suppressed: false, n: Object.values(volume.domains).reduce((a, d) => a + d.n, 0), breakdown: volume.domains })}

${domainSections.length ? domainSections.join("\n\n") : "_No domain had enough activity this quarter to report on._"}
`;

  return { quarter: range.label, content, format: "markdown" };
}

export async function generateAndStoreQuarterlyReport(referenceDate = new Date()) {
  const report = await compileQuarterlyReport(referenceDate);
  await db().query(
    `INSERT INTO quarterly_reports (quarter, format, content)
     VALUES ($1, $2, $3)
     ON CONFLICT (quarter) DO UPDATE SET content = EXCLUDED.content, format = EXCLUDED.format, generated_at = now()`,
    [report.quarter, report.format, report.content]
  );
  return report;
}

export async function getQuarterlyReport(quarter) {
  const { rows } = await db().query(
    `SELECT quarter, generated_at, format, content FROM quarterly_reports WHERE quarter = $1`,
    [quarter]
  );
  return rows[0] || null;
}
