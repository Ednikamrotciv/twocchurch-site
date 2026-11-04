/* live-keyless.mjs — keyless press-free live door (no YouTube API key needed).
   YouTube itself answers "is this channel live" with zero key: GET
   https://www.youtube.com/channel/UC.../live 302-redirects to the live
   watch page while on air, and serves the channel page (200) when not.
   So: manual-redirect read first (authoritative LIVE, one cheap HEAD-like
   read, no HTML parse); else read the page and look for the player's own
   live marker (authoritative OFF when the page is readable but has none).
   Unreadable (bot wall / offline / timeout) returns null — unknown — and
   callers fall through to the client scrape exactly as before. Never throws. */

const CHANNEL_RE = /^UC[\w-]{20,24}$/;
const ID_RE = /^[\w-]{11}$/;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/* Manual-redirect live hit: 302/303/307/308 to /watch?v=ID means on air. */
async function redirectLive(channel) {
  const url = "https://www.youtube.com/channel/" + channel + "/live";
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 8000) : 0;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
      signal: ctrl ? ctrl.signal : undefined,
    });
    const status = res ? res.status : 0;
    if (status !== 301 && status !== 302 && status !== 303 && status !== 307 && status !== 308) return null;
    let loc = "";
    try { loc = res.headers.get("location") || ""; } catch { loc = ""; }
    if (!loc) return null;
    const m = /(?:watch\?v=|\/live\/|\/embed\/|\/v\/|youtu\.be\/)([\w-]{11})/.exec(loc);
    if (m && ID_RE.test(m[1])) return { state: "live", videoId: m[1], title: "", channelId: channel };
    return null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* Readable page with no live marker means off. Unreadable means unknown. */
function pageSaysLive(html, pageUrl) {
  const text = String(html || "");
  const read = /ytInitialData/.test(text) || /"videoDetails":\{/.test(text);
  if (!read) return null;
  const live = /"isLiveNow":true/.test(text)
    || /"hlsManifestUrl":"https?:\/\//.test(text)
    || (/"liveIndicatorText":\{"simpleText":"Live"\}/.test(text) && / watching now"/.test(text))
    || (/"dateText":\{"simpleText":"Started streaming /.test(text) && / watching now"/.test(text))
    || (/"liveChatRenderer":\{"continuations"/.test(text) && / watching now"/.test(text))
    || (/"concurrentViewers":"[0-9,]+"/.test(text) && / watching now"/.test(text));
  if (live) {
    const fromUrl = /(?:watch\?v=|\/live\/|\/embed\/|\/v\/|youtu\.be\/)([\w-]{11})/.exec(String(pageUrl || ""));
    const canonical = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(text);
    const details = /"videoDetails":\{[^}]*?"videoId":"([\w-]{11})"/.exec(text);
    const vid = fromUrl?.[1] || canonical?.[1] || details?.[1] || "";
    const meta = /<meta name="title" content="([^"]*)"/.exec(text);
    return { state: "live", videoId: ID_RE.test(vid) ? vid : "", title: meta?.[1] || "", channelId: channelOf(text) };
  }
  return { state: "off", videoId: "", title: "", channelId: "" };
}

function channelOf(text) {
  const freq = new Map();
  for (const w of String(text || "").matchAll(/"browseId":"(UC[\w-]{20,24})"/g)) freq.set(w[1], (freq.get(w[1]) || 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return "";
  if (ranked.length > 1 && ranked[0][1] < 2 * ranked[1][1]) return "";
  if (ranked[0][1] < 5) return "";
  return ranked[0][0];
}

async function pageLive(channel) {
  const url = "https://www.youtube.com/channel/" + channel + "/live";
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 10000) : 0;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res || !res.ok) return null;
    const text = await res.text().catch(() => "");
    if (!text) return null;
    return pageSaysLive(text, url);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* The keyless answer for one channel: live | off | null (unknown). */
export async function checkKeylessLive(channel) {
  try {
    const ch = String(channel || "").trim();
    if (!CHANNEL_RE.test(ch)) return null;
    const hit = await redirectLive(ch);
    if (hit) return hit;
    const page = await withTimeout(pageLive(ch), 12000).catch(() => null);
    return page;
  } catch {
    return null;
  }
}
