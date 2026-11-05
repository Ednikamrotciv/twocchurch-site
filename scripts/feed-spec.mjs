/* Feed address helpers for Node (publish-at-once): the live box follows the
   office mirror with plain fetch, so this mirrors the browser's livefeed.ts
   URL rules without importing TypeScript. Pure and import-free so the update
   verifier can run it anywhere. Never throws. */

const SPEC_RE = /^\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)@([A-Za-z0-9_.\/-]+)\s*$/;

/** "owner/repo@branch" into parts, or null. */
export function parseFeedSpec(spec) {
  try {
    const m = SPEC_RE.exec(String(spec == null ? "" : spec));
    if (!m) return null;
    if (m[1] === "owner" && m[2] === "repo") return null;
    return { owner: m[1], repo: m[2], branch: m[3] };
  } catch {
    return null;
  }
}

/** Where the feed's seed.json lives, fastest mirror first. */
export function feedSeedUrls(spec) {
  try {
    if (!spec || !spec.owner || !spec.repo || !spec.branch) return [];
    const base = `${spec.owner}/${spec.repo}`;
    return [
      `https://cdn.jsdelivr.net/gh/${base}@${spec.branch}/seed.json`,
      `https://raw.githubusercontent.com/${base}/${spec.branch}/seed.json`,
    ];
  } catch {
    return [];
  }
}

/** The feed's seed, whatever its age — null when no mirror answers. */
export async function peekFeedSeed(spec, fetchImpl, timeoutMs) {
  const doFetch = fetchImpl || fetch;
  const timeout = typeof timeoutMs === "number" ? timeoutMs : 15000;
  for (const url of feedSeedUrls(spec)) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : 0;
    try {
      const res = await doFetch(url, {
        cache: "no-store",
        signal: ctrl ? ctrl.signal : undefined,
        headers: { accept: "application/json" },
      });
      if (!res || !res.ok) continue;
      return await res.json();
    } catch {
      /* mirror failed — try the next one */
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return null;
}
