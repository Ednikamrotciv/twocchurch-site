// Keyless live door for static deploys (no YouTube API key needed).
// Same shape as netlify/functions/live.mjs: GET ?channel=UC… -> {state,
// videoId, title, channelId}. Uses YouTube's own live redirect (302 to the
// live watch page while on air) plus a page read for the off verdict —
// nothing to set in any dashboard. Quota-free.
const CHANNEL_RE = /^UC[\w-]{20,24}$/;
const ID_RE = /^[\w-]{11}$/;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function keylessLive(channel) {
  try {
    const liveUrl = "https://www.youtube.com/channel/" + channel + "/live";
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 8000) : 0;
    try {
      const redir = await fetch(liveUrl, { redirect: "manual", headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" }, signal: ctrl ? ctrl.signal : undefined });
      const loc = (() => { try { return redir.headers.get("location") || ""; } catch { return ""; } })();
      const m = /(?:watch\?v=|\/live\/|\/embed\/|\/v\/|youtu\.be\/)([\w-]{11})/.exec(loc || "");
      if ((redir.status === 301 || redir.status === 302 || redir.status === 303 || redir.status === 307 || redir.status === 308) && m && ID_RE.test(m[1])) {
        return { state: "live", videoId: m[1], title: "", channelId: channel };
      }
    } finally { if (timer) clearTimeout(timer); }
    /* Invidious JSON fallback (v10): unwalled where YouTube HTML is walled. */
    for (const inst of ["https://yt.chocolatemoo53.com", "https://iv.duti.dev"]) {
      const ctrlI = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timerI = ctrlI ? setTimeout(() => { try { ctrlI.abort(); } catch {} }, 8000) : 0;
      try {
        const ir = await fetch(inst + "/api/v1/channels/" + channel + "?hl=en", { headers: { accept: "application/json" }, signal: ctrlI ? ctrlI.signal : undefined });
        if (ir && ir.ok) {
          const jd = await ir.json().catch(() => null);
          if (jd && typeof jd === "object" && (!jd.authorId || String(jd.authorId) === channel) && Array.isArray(jd.latestVideos) && jd.latestVideos.length) {
            const lv = jd.latestVideos.find((v) => v && typeof v === "object" && v.liveNow === true && ID_RE.test(String(v.videoId || "")));
            if (lv) return { state: "live", videoId: String(lv.videoId), title: String(lv.title || ""), channelId: channel };
            return { state: "off", videoId: "", title: "", channelId: "" };
          }
        }
      } catch {} finally { if (timerI) clearTimeout(timerI); }
    }
    const ctrl2 = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer2 = ctrl2 ? setTimeout(() => { try { ctrl2.abort(); } catch {} }, 10000) : 0;
    try {
      const res = await fetch(liveUrl, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" }, signal: ctrl2 ? ctrl2.signal : undefined });
      if (!res || !res.ok) return null;
      const text = await res.text().catch(() => "");
      if (!text || (!/ytInitialData/.test(text) && !/"videoDetails":\{/.test(text))) return null;
      const isLive = /"isLiveNow":true/.test(text) || /"hlsManifestUrl":"https?:\/\//.test(text)
        || (/"liveIndicatorText":\{"simpleText":"Live"\}/.test(text) && / watching now"/.test(text))
        || (/"dateText":\{"simpleText":"Started streaming /.test(text) && / watching now"/.test(text));
      if (!isLive) return { state: "off", videoId: "", title: "", channelId: "" };
      const canonical = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(text);
      const details = /"videoDetails":\{[^}]*?"videoId":"([\w-]{11})"/.exec(text);
      const vid = canonical?.[1] || details?.[1] || "";
      const meta = /<meta name="title" content="([^"]*)"/.exec(text);
      return { state: "live", videoId: ID_RE.test(vid) ? vid : "", title: meta?.[1] || "", channelId: channel };
    } finally { if (timer2) clearTimeout(timer2); }
  } catch { return null; }
}

export async function handler(event) {
  try {
    const channel = ((event.queryStringParameters || {}).channel || "").trim();
    if (!CHANNEL_RE.test(channel)) {
      return { statusCode: 400, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" }, body: "bad channel" };
    }
    const out = await keylessLive(channel);
    if (!out) {
      return { statusCode: 502, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" }, body: "unreachable" };
    }
    return {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
      body: JSON.stringify(out),
    };
  } catch {
    return { statusCode: 502, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" }, body: "unreachable" };
  }
}
