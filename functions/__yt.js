// Cloudflare Pages Function for GET /__yt?url=<youtube url> — same-origin YouTube
// read-through like local's /__yt (scripts/serve.mjs) and netlify/functions/yt.mjs.
// Deploying this repo to Cloudflare Pages picks this file up automatically
// (functions/__yt.js serves /__yt); no client change needed — the app already
// tries same-origin /__yt first, exactly like a local run.
const ALLOWED = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"]);
const MAX_BYTES = 3 * 1024 * 1024;
export async function onRequest(context) {
  const url = new URL(context.request.url).searchParams.get("url") || "";
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { host = ""; }
  const cors = { "cache-control": "no-store", "access-control-allow-origin": "*" };
  if (!ALLOWED.has(host)) return new Response("bad url", { status: 400, headers: cors });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, 10000);
    try {
      const upstream = await fetch(url, {
        headers: {
          /* Browser-shaped read (local livestream fix): consent cookie +
             navigation headers so YouTube answers with the watch page
             instead of a consent/login wall. */
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+667",
          "upgrade-insecure-requests": "1",
          referer: "https://www.youtube.com/",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
          "sec-fetch-user": "?1",
        },
        signal: ctrl.signal,
      });
      let text = "";
      let tooLarge = false;
      try {
        if (!upstream.body) throw new Error("empty");
        const reader = upstream.body.getReader();
        const parts = [];
        let bytes = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > MAX_BYTES) { tooLarge = true; try { reader.cancel(); } catch {} break; }
          parts.push(value);
        }
        if (!tooLarge) {
          const total = parts.reduce((n, p) => n + p.length, 0);
          const buf = new Uint8Array(total);
          let off = 0;
          for (const p of parts) { buf.set(p, off); off += p.length; }
          text = new TextDecoder().decode(buf);
        }
      } catch { tooLarge = true; }
      if (!upstream.ok || !text) return new Response(tooLarge ? "too large" : "unreachable", { status: 502, headers: cors });
      return new Response(text, { status: 200, headers: { ...cors, "content-type": "text/html; charset=utf-8" } });
    } finally { clearTimeout(timer); }
  } catch { return new Response("unreachable", { status: 502, headers: cors }); }
}
