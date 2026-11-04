// Authoritative live door for static deploys (livestream fix).
// Netlify/Vercel-style hosts have no /__live (same-origin Data API door in
// scripts/serve.mjs), so without this the auto-open path only worked on the
// office server. Same shape as /__live: GET ?channel=UC… -> {state,videoId,
// title,channelId}. The key lives ONLY in the function env (Netlify dashboard
// -> Site -> Environment -> YT_API_KEY, then redeploy) — never in browser code.
// Quota-safe: search.list costs 100 units per call; visitors poll about every
// 8-90s, so set YT_API_KEY only if the congregation needs key-based auto-open
// (the published Play stamp already opens the stream with no key at all).
const CHANNEL_RE = /^UC[\\w-]{20,24}$/;
const ID_RE = /^[\\w-]{11}$/;

export async function handler(event) {
  try {
    const channel = ((event.queryStringParameters && event.queryStringParameters.channel) || "").trim();
    if (!CHANNEL_RE.test(channel)) {
      return { statusCode: 400, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" }, body: "bad channel" };
    }
    const key = process.env.YT_API_KEY || "";
    if (!key) {
      return { statusCode: 404, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" }, body: "no key" };
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 8000) : 0;
    try {
      const apiUrl = "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=" + encodeURIComponent(channel) + "&eventType=live&type=video&maxResults=1&key=" + encodeURIComponent(key);
      const upstream = await fetch(apiUrl, { headers: { accept: "application/json" }, signal: ctrl ? ctrl.signal : undefined });
      const data = await upstream.json().catch(() => null);
      if (!upstream.ok || !data) {
        return { statusCode: 502, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" }, body: "unreachable" };
      }
      const item = Array.isArray(data.items) ? data.items[0] : null;
      const videoId = item && item.id && typeof item.id.videoId === "string" ? item.id.videoId : "";
      const out = videoId && ID_RE.test(videoId)
        ? { state: "live", videoId, title: String((item.snippet && item.snippet.title) || ""), channelId: channel }
        : { state: "off", videoId: "", title: "", channelId: "" };
      return {
        statusCode: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
        body: JSON.stringify(out),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return { statusCode: 502, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" }, body: "unreachable" };
  }
}
