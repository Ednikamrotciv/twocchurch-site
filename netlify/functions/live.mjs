// Authoritative live answer for static deploys (livestream fix v9).
// Mirrors scripts/serve.mjs GET /__live: the channel's current live
// broadcast from the YouTube Data API (search.list, eventType=live).
// The key lives ONLY in the function env (Netlify dashboard → Site
// settings → Environment variables → YT_API_KEY) — the browser never sees
// it. Without a key the door answers 404 and visitors fall back to the
// published stamp + scrape, exactly like the office server. Quota-safe:
// short in-memory cache (warm containers reuse it), same shape as /__live.
const CACHE_MS = 75_000;
const cache = new Map();

export async function handler(event) {
  try {
    const params = (event && event.queryStringParameters) || {};
    const channel = String(params.channel || "");
    if (!/^UC[\w-]{20,24}$/.test(channel)) {
      return { statusCode: 400, headers: { "cache-control": "no-store" }, body: "bad channel" };
    }
    const key = process.env.YT_API_KEY || "";
    if (!key) {
      return { statusCode: 404, headers: { "cache-control": "no-store" }, body: "no key" };
    }
    const now = Date.now();
    const hit = cache.get(channel);
    if (hit && now - hit.at < CACHE_MS) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" },
        body: JSON.stringify(hit.data),
      };
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 8000) : 0;
    try {
      const apiUrl =
        "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=" +
        encodeURIComponent(channel) +
        "&eventType=live&type=video&maxResults=1&key=" +
        encodeURIComponent(key);
      const upstream = await fetch(apiUrl, {
        headers: { accept: "application/json" },
        signal: ctrl ? ctrl.signal : undefined,
      });
      const data = await upstream.json().catch(() => null);
      if (!upstream.ok || !data) {
        return { statusCode: 502, headers: { "cache-control": "no-store" }, body: "unreachable" };
      }
      const item = Array.isArray(data.items) ? data.items[0] : null;
      const videoId = item && item.id && typeof item.id.videoId === "string" ? item.id.videoId : "";
      const out =
        videoId && /^[\w-]{11}$/.test(videoId)
          ? { state: "live", videoId, title: String((item.snippet && item.snippet.title) || ""), channelId: channel }
          : { state: "off", videoId: "", title: "", channelId: "" };
      cache.set(channel, { at: now, data: out });
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" },
        body: JSON.stringify(out),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return { statusCode: 502, headers: { "cache-control": "no-store" }, body: "unreachable" };
  }
}
