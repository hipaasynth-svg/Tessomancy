// Seed content for the homepage's "Collective" ticker. These are made-up
// example questions, not real user data — the ticker's job is to make the
// oracle feel alive before there's enough real traffic to show honestly.
// Shape matches what a real, DB-backed feed would eventually return
// (topic, snippet, odds, confidence), so swapping this out for genuine
// recent activity later is a drop-in change to recentReadings() below.
export const SAMPLE_FEED = [
  { topic: "relationships", snippet: "We married at 24, no prior marriages — will it…", odds: 71, confidence: "firm" },
  { topic: "relationships", snippet: "Together 3 years, moved in after year one, will…", odds: 64, confidence: "moderate" },
  { topic: "relationships", snippet: "Second marriage, both have kids from before, ar…", odds: 52, confidence: "moderate" },
  { topic: "relationships", snippet: "Long distance for 18 months, does it usually mak…", odds: 38, confidence: "thin" },
  { topic: "relationships", snippet: "Married young, no college, still together at 10…", odds: 47, confidence: "moderate" },
  { topic: "relationships", snippet: "Dating 6 months, already talking marriage, odds…", odds: 29, confidence: "thin" },
  { topic: "relationships", snippet: "Blended family, three kids total, odds we make i…", odds: 55, confidence: "moderate" },
  { topic: "relationships", snippet: "Met online, engaged within a year, does that las…", odds: 41, confidence: "thin" },
  { topic: "career", snippet: "Startup in fintech, seed funded, odds it survive…", odds: 22, confidence: "firm" },
  { topic: "career", snippet: "Leaving a stable job for a startup at series A, i…", odds: 58, confidence: "moderate" },
  { topic: "career", snippet: "Internal promotion odds after two years in the r…", odds: 34, confidence: "moderate" },
  { topic: "career", snippet: "Switching industries entirely at 40, odds of land…", odds: 46, confidence: "thin" },
  { topic: "career", snippet: "Solo founder, no cofounder, odds of reaching prof…", odds: 18, confidence: "firm" },
  { topic: "career", snippet: "Going remote-first, odds the company still exists…", odds: 63, confidence: "moderate" },
  { topic: "career", snippet: "Second startup after one failure, odds this one w…", odds: 27, confidence: "moderate" },
  { topic: "health", snippet: "Common outpatient procedure, odds of complicatio…", odds: 91, confidence: "firm" },
  { topic: "health", snippet: "Recovery within six weeks for a routine surgery,…", odds: 84, confidence: "firm" },
  { topic: "health", snippet: "Odds of recurrence within five years after treatm…", odds: 31, confidence: "moderate" },
  { topic: "health", snippet: "Physical therapy alone resolving it without surge…", odds: 57, confidence: "moderate" },
  { topic: "health", snippet: "Odds a first-time procedure like this goes as pla…", odds: 88, confidence: "firm" },
  { topic: "finance", snippet: "First-time home buyers in this price range, odds…", odds: 42, confidence: "moderate" },
  { topic: "finance", snippet: "Odds a small business breaks even in year one…", odds: 35, confidence: "moderate" },
  { topic: "finance", snippet: "Relocating for a lower cost of living, odds of ne…", odds: 61, confidence: "thin" },
  { topic: "finance", snippet: "Odds of paying off consumer debt within two year…", odds: 39, confidence: "moderate" },
  { topic: "finance", snippet: "Investing a windfall vs. paying down the mortgage…", odds: 66, confidence: "thin" },
  { topic: "family", snippet: "Odds an only child ends up close with their paren…", odds: 74, confidence: "moderate" },
  { topic: "family", snippet: "Odds of a smooth transition after a cross-country…", odds: 53, confidence: "thin" },
  { topic: "family", snippet: "Blended household with a new stepparent, odds of…", odds: 49, confidence: "thin" },
  { topic: "family", snippet: "Odds an adult child moves back home after colleg…", odds: 44, confidence: "moderate" },
  { topic: "education", snippet: "Odds of finishing a part-time degree while workin…", odds: 48, confidence: "moderate" },
  { topic: "education", snippet: "Odds a career-change grad program pays off within…", odds: 37, confidence: "thin" },
  { topic: "education", snippet: "First-generation college student, odds of graduat…", odds: 59, confidence: "moderate" },
  { topic: "general", snippet: "Odds of a lease renewal going smoothly after a la…", odds: 77, confidence: "moderate" },
  { topic: "general", snippet: "Odds a rescue dog adjusts well within the first m…", odds: 82, confidence: "firm" },
  { topic: "general", snippet: "Odds of a home renovation finishing on budget…", odds: 24, confidence: "firm" },
  { topic: "general", snippet: "Odds a used car this age needs major repairs with…", odds: 33, confidence: "moderate" },
  { topic: "relationships", snippet: "Reconnecting with an ex after years apart, odds i…", odds: 26, confidence: "thin" },
  { topic: "relationships", snippet: "Open relationship after being monogamous, odds i…", odds: 31, confidence: "thin" },
  { topic: "career", snippet: "Negotiating a raise this cycle, odds of getting a…", odds: 54, confidence: "moderate" },
  { topic: "career", snippet: "Odds a layoff round affects a specific department…", odds: 21, confidence: "thin" },
  { topic: "health", snippet: "Odds lifestyle changes alone lower it without med…", odds: 45, confidence: "moderate" },
  { topic: "health", snippet: "Odds of a full recovery timeline holding for an a…", odds: 79, confidence: "moderate" },
  { topic: "finance", snippet: "Odds a side business becomes full-time income wit…", odds: 19, confidence: "firm" },
  { topic: "finance", snippet: "Cosigning a loan for a family member, odds it goe…", odds: 68, confidence: "thin" },
  { topic: "family", snippet: "Odds siblings stay close after a parent's estate…", odds: 62, confidence: "moderate" },
  { topic: "family", snippet: "Odds a long engagement changes the wedding plans…", odds: 28, confidence: "thin" },
  { topic: "education", snippet: "Odds of passing a licensing exam on the first try…", odds: 67, confidence: "firm" },
  { topic: "general", snippet: "Odds a startup pet business survives its first ye…", odds: 23, confidence: "moderate" },
  { topic: "general", snippet: "Odds a house sells within 60 days in this market…", odds: 51, confidence: "moderate" },
  { topic: "relationships", snippet: "Getting married after a short courtship abroad, o…", odds: 36, confidence: "thin" },
];

// Fisher-Yates partial shuffle — picks `n` distinct items without biasing
// toward the front of the array the way naive slicing would.
export function randomSample(list, n) {
  const pool = [...list];
  const picked = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}
