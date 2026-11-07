// YouTube read-through for static deploys (livestream fix).
// Static hosts have no /__yt (the SPA fallback answers 200 index.html there),
// so without this the Watch screen + Recent services depended on the public
// CORS proxy alone. Same-origin, YouTube-only (SSRF guard mirrors
// scripts/serve.mjs), no deps, GET ?url=<youtube url>.
const ALLOWED = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"]);
const MAX_BYTES = 3 * 1024 * 1024;
/* Error responses carry the same CORS + no-store headers as success (fix):
   cross-origin callers (local dev, previews) must be able to READ the 502
   and treat it as "unknown" — without ACAO the fetch rejects opaquely and
   a distinguishable off/unknown answer degrades into an exception. */
const ERR_HEADERS = { "cache-control": "no-store", "access-control-allow-origin": "*" };

export async function handler(event) {
  try {
    const url = (event.queryStringParameters && event.queryStringParameters.url) || "";
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { host = ""; }
    if (!ALLOWED.has(host)) {
      return { statusCode: 400, headers: ERR_HEADERS, body: "bad url" };
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, 10000) : 0;
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
        signal: ctrl ? ctrl.signal : undefined,
      });
      /* Streamed cap like scripts/serve.mjs /__yt (deployed parity): cancel
         past 3 MB instead of buffering an unbounded body into the function. */
      let text = "";
      let tooLarge = false;
      try {
        if (!upstream.body) throw new Error("empty");
        let bytes = 0;
        const parts = [];
        for await (const chunk of upstream.body) {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) {
            tooLarge = true;
            try { await upstream.cancel(); } catch {}
            break;
          }
          parts.push(chunk);
        }
        if (!tooLarge) text = Buffer.concat(parts).toString("utf8");
      } catch {
        tooLarge = true;
      }
      if (!upstream.ok || !text) {
        return { statusCode: 502, headers: ERR_HEADERS, body: tooLarge ? "too large" : "unreachable" };
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
    return { statusCode: 502, headers: ERR_HEADERS, body: "unreachable" };
  }
}
