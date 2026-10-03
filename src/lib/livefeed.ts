/* The live content feed: the office's published words, read straight off the
   public repo — no rebuild, no redeploy, no server. The office publishes
   locally as always; auto-push carries seed.json to GitHub; every deployed
   copy polls the feed and paints whatever is newer than what it has.

   Reads are public by design (it is the public site's own words, on hosts
   built for cross-origin fetching). Writes still happen only on the office
   computer, through git — nothing here can publish, so there is no secret to
   steal and no password to bypass. Anything goes wrong (offline, private
   repo, rate-limited) and the copy silently keeps its baked words. */

export type FeedSpec = { owner: string; repo: string; branch: string };

const SPEC_RE = /^\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)@([A-Za-z0-9_.\/-]+)\s*$/;

/** "owner/repo@branch" (the publish-feed.txt line) into parts, or null. */
export function parseFeedSpec(spec: unknown): FeedSpec | null {
  const m = SPEC_RE.exec(String(spec == null ? "" : spec));
  if (!m) return null;
  if (m[1] === "owner" && m[2] === "repo") return null;
  return { owner: m[1], repo: m[2], branch: m[3] };
}

/** Where the feed's seed.json lives, fastest mirror first. */
export function feedSeedUrls(spec: FeedSpec): string[] {
  const base = `${spec.owner}/${spec.repo}`;
  return [
    `https://cdn.jsdelivr.net/gh/${base}@${spec.branch}/seed.json`,
    `https://raw.githubusercontent.com/${base}/${spec.branch}/seed.json`,
  ];
}

export type FeedSeed = { rev: number; sections: Record<string, unknown> };

/** True when the fetched seed is worth painting (newer than ours). */
export function feedIsNewer(seed: unknown, currentRev: number): seed is FeedSeed {
  if (!seed || typeof seed !== "object") return false;
  const s = seed as { rev?: unknown; sections?: unknown };
  if (typeof s.rev !== "number" || s.rev <= currentRev) return false;
  if (!s.sections || typeof s.sections !== "object" || !Object.keys(s.sections).length) return false;
  return true;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer: ReturnType<typeof setTimeout> | number = ctrl
    ? setTimeout(() => ctrl.abort(), timeoutMs)
    : 0;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error("http " + res.status);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer as ReturnType<typeof setTimeout>);
  }
}

/** The feed's seed when it is newer than currentRev, else null. Never throws. */
export async function fetchLiveSeed(spec: FeedSpec, currentRev: number, timeoutMs = 15000): Promise<FeedSeed | null> {
  for (const url of feedSeedUrls(spec)) {
    try {
      const seed = await fetchJson(url, timeoutMs);
      if (feedIsNewer(seed, currentRev)) return seed as FeedSeed;
      return null;
    } catch {
      /* mirror failed — try the next one */
    }
  }
  return null;
}

/** This copy's baked feed address (dist/feed.json), or null. Never throws. */
export async function bakedFeedSpec(): Promise<FeedSpec | null> {
  try {
    const res = await fetch("feed.json", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return parseFeedSpec(data && (data.feed || data.spec));
  } catch {
    return null;
  }
}
