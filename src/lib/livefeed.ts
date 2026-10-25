/* Live content feed: published words read off the public repo. Writes happen only via git. */

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

/* Feed-backed uploads (wipe durability): anything the office pushed lives on
   the public repo too, so a copy whose disk copy is gone can still paint and
   heal it. uploadsDir is the baked layout — "uploads" for a mirror repo,
   "data/uploads" for a public source repo. Raw first (fresh minutes after a
   push, serves any size GitHub holds); jsdelivr second (fast, cached, but
   slow to learn new files and capped in size). Pure: no network, never throws. */
export function feedUploadUrls(spec: FeedSpec | null, name: string, uploadsDir: string): string[] {
  const clean = String(name == null ? "" : name);
  if (!spec || !clean) return [];
  if (/[/\\]/.test(clean) || clean.includes("..")) return [];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(clean)) return [];
  const dir = uploadsDir === "uploads" ? "uploads" : "data/uploads";
  const base = `${spec.owner}/${spec.repo}`;
  return [
    `https://raw.githubusercontent.com/${base}/${spec.branch}/${dir}/${clean}`,
    `https://cdn.jsdelivr.net/gh/${base}@${spec.branch}/${dir}/${clean}`,
  ];
}

export type FeedSeed = { rev: number; sections: Record<string, unknown>; notes?: number; publishedDeploy?: string };

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

/** The feed's seed, whatever its age — null when no mirror answers. Never throws. */
export async function peekSeed(spec: FeedSpec, timeoutMs = 15000): Promise<unknown> {
  for (const url of feedSeedUrls(spec)) {
    try {
      return await fetchJson(url, timeoutMs);
    } catch {
      /* mirror failed — try the next one */
    }
  }
  return null;
}

/** The feed's seed when it is newer than currentRev, else null. Never throws. */
export async function fetchLiveSeed(spec: FeedSpec, currentRev: number, timeoutMs = 15000): Promise<FeedSeed | null> {
  const seed = await peekSeed(spec, timeoutMs);
  if (feedIsNewer(seed, currentRev)) return seed as FeedSeed;
  return null;
}

/** This copy's baked feed address (dist/feed.json), or null. Never throws. */
export async function bakedFeedSpec(): Promise<FeedSpec | null> {
  try {
    const res = await fetch(siteFile("feed.json"), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return parseFeedSpec(data && (data.feed || data.spec));
  } catch {
    return null;
  }
}

/** The baked uploads layout ("uploads" for a mirror repo, "data/uploads" for
    a public source repo) — "data/uploads" when no feed is baked. Never throws. */
export async function bakedFeedUploadsDir(): Promise<string> {
  try {
    const res = await fetch(siteFile("feed.json"), { cache: "no-store" });
    if (!res.ok) return "data/uploads";
    const data = await res.json().catch(() => null);
    if (data && data.uploads === "uploads") return "uploads";
    return "data/uploads";
  } catch {
    return "data/uploads";
  }
}

/* The folder the site is served from, from the bundle's own script URL. */
let base: string | null = null;
export function siteBase(): string {
  if (base !== null) return base;
  base = "/";
  try {
    const scripts = document.getElementsByTagName("script");
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = (scripts[i] as HTMLScriptElement).src || "";
      const m = /^(.*\/)src\/bundle\.js(\?.*)?$/.exec(src);
      if (m) {
        try {
          const u = new URL(m[1], document.baseURI);
          base = u.pathname.endsWith("/") ? u.pathname : u.pathname + "/";
        } catch {
          base = m[1];
        }
        break;
      }
    }
  } catch {
    base = "/";
  }
  return base;
}

/** A repo-relative file ("seed.json", "src/assets/img/hero.jpg") as a URL. */
export function siteFile(rel: string): string {
  const r = String(rel == null ? "" : rel);
  if (/^(https?:|data:|blob:|mailto:|tel:)/i.test(r)) return r;
  return siteBase() + r.replace(/^\/+/, "");
}
