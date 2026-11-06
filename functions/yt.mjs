// YouTube read-through for Cloudflare Pages (local-parity fix).
// Mirrors netlify/functions/yt.mjs: static hosts have no /__yt (the SPA
// fallback answers 200 index.html there), so without this the Watch screen +
// Recent services depended on the public CORS proxy alone — while local reads
// through its own /__yt. Same-origin, YouTube-only SSRF guard, no deps.
// Cloudflare Pages serves this file (functions/yt.mjs) at /yt.
// Also reachable at /functions/yt on hosts that mirror it.
const ALLOWED = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"]);
const MAX_BYTES = 3 * 1024 * 1024;

async function readUpstream(url, signal) {
  const upstream = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
    },
    signal,
  });
  const text = await upstream.text().catch(() => "");
  return { upstream, text };
}

export async function onRequest(context) {
  try {
    const reqUrl = new URL(context.request.url);
    const url = reqUrl.searchParams.get("url") || "";
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { host = ""; }
    if (!ALLOWED.has(host)) {
      return new Response("bad url", { status: 400, headers: { "cache-control": "no-store" } });
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 10000) : 0;
    try {
      const { upstream, text } = await readUpstream(url, ctrl ? ctrl.signal : undefined);
      if (!upstream.ok || !text) {
        return new Response("unreachable", { status: 502, headers: { "cache-control": "no-store" } });
      }
      if (text.length > MAX_BYTES) {
        return new Response("too large", { status: 502, headers: { "cache-control": "no-store" } });
      }
      return new Response(text, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return new Response("unreachable", { status: 502, headers: { "cache-control": "no-store" } });
  }
}
