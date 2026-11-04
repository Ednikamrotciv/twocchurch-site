// Authoritative live answer for static deploys (livestream fix v10).
// Static hosts have no /__live (the SPA fallback answers 200 index.html
// there), so without this the Watch screen's Data-API door never answered
// off-office. Same validation, same split TTLs and quota backoff as
// scripts/serve.mjs. Key lives in the function env (YT_API_KEY) — never in
// frontend code. GET ?channel=UC… — YouTube channel ids only (SSRF guard
// mirrors /__yt and /__live).
const LIVE_HIT_TTL_MS = 75_000;
const LIVE_MISS_TTL_MS = 15 * 60_000;
const LIVE_ERR_TTL_MS = 60_000;
const LIVE_QUOTA_TTL_MS = 10 * 60_000;
const cache = new Map();

function cappedSet(channel, entry) {
  try {
    cache.set(channel, entry);
    if (cache.size > 50) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
  } catch {}
}

export async function handler(event) {
  try {
    const channel = (event.queryStringParameters && event.queryStringParameters.channel) || "";
    if (!/^UC[\w-]{20,24}$/.test(channel)) {
      return { statusCode: 400, headers: { "cache-control": "no-store" }, body: "bad channel" };
    }
    const key = process.env.YT_API_KEY || "";
    if (!key) {
      return { statusCode: 404, headers: { "cache-control": "no-store" }, body: "no key" };
    }
    const now = Date.now();
    const hit = cache.get(channel);
    if (hit && !hit.err && hit.data) {
      const ttl = hit.data.state === "live" ? LIVE_HIT_TTL_MS : LIVE_MISS_TTL_MS;
      if (now - hit.at < ttl) {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
          body: JSON.stringify(hit.data),
        };
      }
    }
    if (hit && hit.err && now - hit.at < (hit.quota ? LIVE_QUOTA_TTL_MS : LIVE_ERR_TTL_MS)) {
      return { statusCode: 502, headers: { "cache-control": "no-store" }, body: "unreachable" };
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 8000) : 0;
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channel)}&eventType=live&type=video&maxResults=1&key=${encodeURIComponent(key)}`;
      const upstream = await fetch(apiUrl, {
        headers: { accept: "application/json" },
        signal: ctrl ? ctrl.signal : undefined,
      });
      const data = await upstream.json().catch(() => null);
      const quotaHit = !upstream.ok && data && (data?.error?.errors?.[0]?.reason === "quotaExceeded" || data?.error?.status === "RESOURCE_EXHAUSTED" || upstream.status === 403 || upstream.status === 429);
      if (!upstream.ok || !data) {
        cappedSet(channel, { at: now, err: true, quota: !!quotaHit });
        return { statusCode: 502, headers: { "cache-control": "no-store" }, body: "unreachable" };
      }
      const item = Array.isArray(data.items) ? data.items[0] : null;
      const videoId = item && item.id && typeof item.id.videoId === "string" ? item.id.videoId : "";
      const out = videoId && /^[\w-]{11}$/.test(videoId)
        ? { state: "live", videoId, title: String((item.snippet && item.snippet.title) || ""), channelId: channel }
        : { state: "off", videoId: "", title: "", channelId: "" };
      cappedSet(channel, { at: now, data: out });
      return {
        statusCode: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
        body: JSON.stringify(out),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    try { cappedSet(String((event.queryStringParameters && event.queryStringParameters.channel) || ""), { at: Date.now(), err: true, quota: false }); } catch {}
    return { statusCode: 502, headers: { "cache-control": "no-store" }, body: "unreachable" };
  }
}
