// YouTube read-through for static deploys (livestream fix).
// Static hosts have no /__yt (the SPA fallback answers 200 index.html there),
// so without this the Watch screen + Recent services depended on the public
// CORS proxy alone. Same-origin, YouTube-only (SSRF guard mirrors
// scripts/serve.mjs), no deps, GET ?url=<youtube url>.
const ALLOWED = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"]);
const MAX_BYTES = 3 * 1024 * 1024;
/* Warm-instance cache (update 441, speed): repeated polls for the same 2-3
   YouTube URLs reuse the last good read for 20s instead of paying a fresh
   upstream fetch per tab per check. Failures are never cached. */
const CACHE_MS = 20_000;
const cache = new Map();

export async function handler(event) {
  try {
    const url = (event.queryStringParameters && event.queryStringParameters.url) || "";
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { host = ""; }
    if (!ALLOWED.has(host)) {
      return { statusCode: 400, headers: { "cache-control": "no-store" }, body: "bad url" };
    }
    try {
      const hit = cache.get(url);
      if (hit && typeof hit.text === "string" && Date.now() - hit.at < CACHE_MS) {
        return {
          statusCode: 200,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
          body: hit.text,
        };
      }
    } catch {
      /* cache unreadable — fetch live below */
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 10000) : 0;
    try {
      const upstream = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: ctrl ? ctrl.signal : undefined,
      });
      const text = await upstream.text().catch(() => "");
      if (!upstream.ok || !text) {
        return { statusCode: 502, headers: { "cache-control": "no-store" }, body: "unreachable" };
      }
      if (text.length > MAX_BYTES) {
        return { statusCode: 502, headers: { "cache-control": "no-store" }, body: "too large" };
      }
      try {
        cache.set(url, { text, at: Date.now() });
        if (cache.size > 50) {
          const oldest = cache.keys().next().value;
          cache.delete(oldest);
        }
      } catch {
        /* caching is best-effort only */
      }
      return {
        statusCode: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
        body: text,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return { statusCode: 502, headers: { "cache-control": "no-store" }, body: "unreachable" };
  }
}
