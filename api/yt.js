// Vercel serverless YouTube read-through for GET /api/yt?url=<youtube url>.
// Same-origin, YouTube-only, mirrors scripts/serve.mjs /__yt and
// netlify/functions/yt.mjs. Deploying this repo to Vercel picks up api/yt.js
// automatically; the app races it alongside the Netlify door (see
// fetchPageStaticProxy / fetchTextStaticProxy), so Vercel static deploys read
// YouTube like a local run instead of depending on the public CORS proxies.
const ALLOWED = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"]);
const MAX_BYTES = 3 * 1024 * 1024;
export default async function handler(req, res) {
  const url = (req.query && req.query.url) || "";
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { host = ""; }
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", "*");
  if (!ALLOWED.has(host)) { res.status(400).send("bad url"); return; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, 10000);
  try {
    const upstream = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
      signal: ctrl.signal,
    });
    let text = "";
    let tooLarge = false;
    try {
      if (!upstream.body) throw new Error("empty");
      const parts = [];
      let bytes = 0;
      for await (const chunk of upstream.body) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { tooLarge = true; try { await upstream.cancel(); } catch {} break; }
        parts.push(chunk);
      }
      if (!tooLarge) text = Buffer.concat(parts).toString("utf8");
    } catch { tooLarge = true; }
    if (!upstream.ok || !text) { res.status(502).send(tooLarge ? "too large" : "unreachable"); return; }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).send(text);
  } catch { res.status(502).send("unreachable"); }
  finally { clearTimeout(timer); }
}
