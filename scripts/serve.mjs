import http from "node:http";
import { readFile, stat, mkdir, writeFile, unlink } from "node:fs/promises";
import { watch } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { createCmsHost, hashText } from "./cms-local.mjs";
import { createGeoProxy } from "./geo-proxy.mjs";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 5173);
const APP_TAG = '<script type="module" src="src/bundle.js"></script>';
const SHIM_TAG = '<script src="/scripts/local-shim.js"></script>';
const RELOAD_TAG = '<script src="/scripts/local-reload.js"></script>';
const INJECT = SHIM_TAG + "\n" + RELOAD_TAG + "\n" + APP_TAG;

/* The running folder's fingerprint: any code change retires older browser
   drafts and older local publishes, so the extract you are running is the
   only state. */
let SITE_VERSION = "dev";
try {
  const stamp = await readFile(path.join(ROOT, "index.html"), "utf8");
  const js = await readFile(path.join(ROOT, "src", "bundle.js"), "utf8");
  const css = await readFile(path.join(ROOT, "src", "bundle.css"), "utf8");
  let seedHead = "";
  try {
    seedHead = (await readFile(path.join(ROOT, "data", "cms-state.bin"))).subarray(0, 4096).toString("latin1");
  } catch { /* no seed ships — version ignores it */ }
  SITE_VERSION = hashText(stamp + "#" + js.length + "#" + js.slice(0, 4096) + "#" + css.length + "#" + seedHead.length + "#" + seedHead);
} catch { /* version stays a constant; nothing else changes */ }
try {
  await stat(path.join(ROOT, "src", "bundle.js"));
  for (const stale of ["app.js", "app.css"]) {
    try {
      await unlink(path.join(ROOT, "src", stale));
    } catch { /* already gone */ }
  }
} catch { /* no bundle yet — nothing to clean */ }
console.log(`running ${ROOT}  [code ${SITE_VERSION}]`);

/* Browsers listening here get a `reload` nudge after every rebuild, so the
   page refreshes itself — no manual or hard refresh needed. */
const reloadClients = new Set();
function broadcastReload() {
  for (const send of [...reloadClients]) {
    try {
      send("reload");
    } catch {
      reloadClients.delete(send);
    }
  }
}

const cms = await createCmsHost(ROOT);
const geoProxy = createGeoProxy();

/* The browser runs the built bundle, not the sources — so saving anything
   under src/ rebuilds it on the spot, exactly like the live preview. */
let buildSite = null;
try {
  ({ buildSite } = await import("./build-lib.mjs"));
} catch {
  console.log("auto-rebuild is off (esbuild not installed — run `npm install` to enable it)");
}
if (buildSite) {
  let timer = 0;
  let building = false;
  let queued = false;
  const run = async () => {
    if (building) {
      queued = true;
      return;
    }
    building = true;
    try {
      const written = await buildSite();
      console.log("rebuilt " + written.map((f) => `${f.path} (${f.bytes}b)`).join(", "));
      broadcastReload();
    } catch (err) {
      console.error("rebuild failed:", err?.message || err);
    }
    building = false;
    if (queued) {
      queued = false;
      run();
    }
  };
  try {
    watch(path.join(ROOT, "src"), { recursive: true }, (_event, name) => {
      const n = String(name || "").replace(/\\/g, "/");
      if (/(^|\/)bundle\.(js|css)$/.test(n)) return;
      if (!/\.(tsx|ts|jsx|js|mjs|css|json)$/.test(n)) return;
      clearTimeout(timer);
      timer = setTimeout(() => run(), 400);
    });
    console.log("watching src/ — saving a file rebuilds the site automatically");
  } catch {
    console.log("file watching is unavailable here — run `npm run build` by hand after edits");
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

function sendSse(res, text) {
  for (const line of String(text).split("\n")) res.write("data: " + line + "\n");
  res.write("\n");
}

/* Static files: revalidate + ETag + gzip. The old code sent `no-store` with no
   compression, so every reload re-downloaded the whole bundle (~2 MB) and every
   photo uncompressed — that is the slowness vs the preview. `no-cache` still
   revalidates each load (an edit is picked up at once: the mtime in the tag
   changes), but an unchanged file answers 304 with no body. */
const COMPRESSIBLE = /^(text\/|application\/(javascript|json)|image\/svg)/;
function sendBody(req, res, body, mime, tag) {
  const etag = '"' + tag + '"';
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { etag, "cache-control": "no-cache" });
    res.end();
    return;
  }
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const accept = req.headers["accept-encoding"] || "";
  if (buf.length > 1024 && accept.includes("gzip") && COMPRESSIBLE.test(mime)) {
    const gz = gzipSync(buf);
    res.writeHead(200, {
      "content-type": mime,
      "content-length": gz.length,
      "content-encoding": "gzip",
      etag,
      "cache-control": "no-cache",
      vary: "accept-encoding",
    });
    res.end(gz);
    return;
  }
  res.writeHead(200, {
    "content-type": mime,
    "content-length": buf.length,
    etag,
    "cache-control": "no-cache",
  });
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/scripts/local-shim.js" && req.method === "GET") {
      const shim = await readFile(path.join(ROOT, "scripts", "local-shim.js"), "utf8");
      const body = shim.split("__SITE_VERSION__").join(SITE_VERSION);
      sendBody(req, res, body, "text/javascript; charset=utf-8", "shim-" + hashText(body));
      return;
    }

    if (pathname === "/__local/reload" && req.method === "GET") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(": listening\n\n");
      const send = (text) => {
        for (const line of String(text).split("\n")) res.write("data: " + line + "\n");
        res.write("\n");
      };
      reloadClients.add(send);
      req.on("close", () => reloadClients.delete(send));
      return;
    }

    if ((pathname === "/__geo" || pathname === "/__rates") && req.method === "GET") {
      if (pathname === "/__geo") await geoProxy.handleGeo(req, res);
      else await geoProxy.handleRates(req, res);
      return;
    }

    if (pathname === "/__yt" && req.method === "GET") {
      const target = url.searchParams.get("url") || "";
      let host = "";
      try {
        host = new URL(target).hostname.toLowerCase();
      } catch {
        host = "";
      }
      const allowed = host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
      if (!allowed) {
        res.writeHead(400, { "cache-control": "no-store" });
        res.end("bad url");
        return;
      }
      try {
        const upstream = await fetch(target, {
          headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            "accept-language": "en-US,en;q=0.9",
          },
        });
        const text = await upstream.text();
        if (!upstream.ok || !text) {
          res.writeHead(502, { "cache-control": "no-store" });
          res.end("unreachable");
          return;
        }
        const body = Buffer.from(text, "utf8");
        const accept = req.headers["accept-encoding"] || "";
        if (body.length > 1024 && accept.includes("gzip")) {
          const gz = gzipSync(body);
          res.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "content-length": gz.length,
            "content-encoding": "gzip",
            "cache-control": "no-store",
            vary: "accept-encoding",
          });
          res.end(gz);
          return;
        }
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-length": body.length,
          "cache-control": "no-store",
        });
        res.end(body);
      } catch {
        res.writeHead(502, { "cache-control": "no-store" });
        res.end("unreachable");
      }
      return;
    }

    if (pathname === "/__cms/events" && req.method === "GET") {
      const id = url.searchParams.get("conn") || "anon";
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(": connected\n\n");
      cms.attachSender(id, (text) => sendSse(res, text));
      cms.openConn(id);
      const beat = setInterval(() => {
        try {
          res.write(":\n\n");
        } catch { /* tab went away */ }
      }, 25000);
      req.on("close", () => {
        clearInterval(beat);
        cms.detachSender(id);
        cms.closeConn(id);
      });
      return;
    }

    /* Local file uploads: the Perchance upload service only exists on the live
       site, so local runs keep the office's photos and videos on their own
       disk (data/uploads/), served back like any other file. */
    if (pathname === "/__upload" && req.method === "POST") {
      const ctype = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (!ctype.startsWith("image/") && !ctype.startsWith("video/")) {
        res.writeHead(400, { "cache-control": "no-store" });
        res.end("bad filetype");
        return;
      }
      const chunks = [];
      let size = 0;
      let tooBig = false;
      req.on("data", (chunk) => {
        if (tooBig) return;
        size += chunk.length;
        if (size > 250 * 1024 * 1024) {
          tooBig = true;
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", async () => {
        if (tooBig) return;
        try {
          const asked = String(url.searchParams.get("name") || "file").split("/").pop() || "file";
          let safe = asked.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
          if (!/\.[a-zA-Z0-9]{2,5}$/.test(safe)) {
            const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" }[ctype] || "";
            safe += ext;
          }
          const dir = path.join(ROOT, "data", "uploads");
          await mkdir(dir, { recursive: true });
          const fname = Date.now().toString(36) + "-" + safe;
          await writeFile(path.join(dir, fname), Buffer.concat(chunks));
          const body = JSON.stringify({ url: "/data/uploads/" + fname });
          res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          res.end(body);
        } catch {
          res.writeHead(500, { "cache-control": "no-store" });
          res.end("save failed");
        }
      });
      req.on("error", () => {
        res.writeHead(413, { "cache-control": "no-store" });
        res.end("too large");
      });
      return;
    }

    const rpcMatch = pathname.match(/^\/__cms\/([A-Za-z0-9_]+)$/);    if (rpcMatch && req.method === "POST") {
      const id = url.searchParams.get("conn") || "anon";
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 8 * 1024 * 1024) req.destroy();
      });
      req.on("end", async () => {
        const r = await cms.call(rpcMatch[1], id, body);
        res.writeHead(r.status, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(r.body);
      });
      return;
    }

    let rel = decodeURIComponent(pathname).replace(/^\/+/, "");
    if (!rel) rel = "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const st = await stat(file).catch(() => null);
    if ((!st || !st.isFile()) && !pathname.startsWith("/__cms/")) {
      /* Standalone nicety: unknown paths (e.g. /admin) serve the app so the
         router can resolve them — the hash stays the route on perchance.org. */
      const shell = await readFile(path.join(ROOT, "index.html"), "utf8");
      const body = Buffer.from(shell.split(APP_TAG).join(INJECT));
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": body.length,
        "cache-control": "no-store",
      });
      res.end(body);
      return;
    }
    if (!st || !st.isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    let body = await readFile(file);
    if (path.basename(file) === "index.html" && body.includes(APP_TAG)) {
      body = Buffer.from(body.toString("utf8").split(APP_TAG).join(INJECT));
    }
    const mime = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    if (path.basename(file) === "index.html") {
      /* Entry document: always fresh (a few KB — negligible). */
      res.writeHead(200, {
        "content-type": mime,
        "content-length": body.length,
        "cache-control": "no-store",
      });
      res.end(body);
      return;
    }
    sendBody(req, res, body, mime, st.size + "-" + Math.round(st.mtimeMs));
  } catch {
    res.writeHead(500);
    res.end("server error");
  }
});

server.listen(PORT, () => {
  console.log(`Site + admin backend at http://localhost:${PORT}/  (admin: /admin)`);
});
