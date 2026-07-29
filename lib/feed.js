import { SAMPLE_FEED, randomSample } from "./sampleFeed.js";

// Powers the homepage's public "Collective" feed. For now this draws from a
// curated, made-up sample pool (lib/sampleFeed.js) rather than real traffic —
// there isn't enough real volume yet to show honestly, and showing fabricated
// data as real would undercut the product's honesty pitch, so this is
// explicitly presented as illustrative. The return shape (topic, snippet,
// odds, confidence, loggedAt) is what a real DB-backed feed would eventually
// return too, so swapping the source later doesn't require touching callers.
export async function recentReadings({ limit = 8 } = {}) {
  const picked = randomSample(SAMPLE_FEED, limit);
  const now = Date.now();
  return picked.map((item) => ({
    ...item,
    loggedAt: new Date(now - Math.random() * 4 * 3600 * 1000).toISOString(),
  }));
}
