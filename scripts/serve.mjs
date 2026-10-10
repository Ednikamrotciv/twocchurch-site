import http from "node:http";
import { readFile, stat, mkdir, writeFile, rm } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { createCmsHost, hashText } from "./cms-local.mjs";
import { answerWithSeedFallback } from "./seed-fallback.mjs";
import { createGeoProxy } from "./geo-proxy.mjs";
import { guardAtBoot } from "./backup-data.mjs";
import { MIME } from "./mime.mjs";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 5173);
const DIST = path.join(ROOT, "dist");
const SHIM_TAG = '<script src="/scripts/local-shim.js"></script>';

/* Served pages are the production build (`npm run build`). The shim connects
   the local browser to this backend (sign-in, publish, uploads) — deployed
   copies join the office server through server.json instead. */
function withShim(html) {
  const src = String(html);
  if (src.includes(SHIM_TAG)) return src;
  if (src.includes('<script type="module"')) return src.replace('<script type="module"', SHIM_TAG + "\n    " + '<script type="module"');
  return src + "\n" + SHIM_TAG + "\n";
}

/* The running folder's fingerprint: any code change retires older browser
   drafts and older local publishes, so the extract you are running is the
   only state. */
let SITE_VERSION = "dist";
try {
  const stamp = await readFile(path.join(DIST, "index.html"), "utf8");
  SITE_VERSION = hashText(stamp.slice(0, 8192));
} catch {
  console.error("no dist/index.html — run `npm run build` first, then `npm start`.");
  process.exit(1);
}
console.log(`serving ${DIST} + admin backend  [code ${SITE_VERSION}]`);

/* Which update this folder carries vs what dist/ was built from (note 248):
   an old dist served by `npm start` can never pass silently again. */
let SRC_NOTES = 0;
try {
  const src = await readFile(path.join(ROOT, "src", "lib", "hooks.ts"), "utf8");
  SRC_NOTES = Number((src.match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
} catch {
  /* stamp unreadable — the page stamp still shows */
}
let DIST_NOTES = 0;
try {
  DIST_NOTES = Number(JSON.parse(await readFile(path.join(DIST, "version.json"), "utf8")).notes) || 0;
} catch {
  /* built before version stamps — treated as old */
}
if (SRC_NOTES) console.log(`site update ${SRC_NOTES} (Admin > Tools shows the same number)`);
if (SRC_NOTES && DIST_NOTES && DIST_NOTES < SRC_NOTES) {
  console.warn(`OLD BUILD: dist/ is update ${DIST_NOTES} but this folder is update ${SRC_NOTES} — run \`npm run build\` before \`npm start\`, or use \`npm run dev\`.`);
} else if (SRC_NOTES && !DIST_NOTES) {
  console.warn(`dist/ has no version stamp (built before update stamps) — run \`npm run build\` so dist/ matches update ${SRC_NOTES}.`);
}

const cms = await (async () => {
  /* Snapshot the published words first (a zip extract cannot touch the
     timestamped backup names), and recover the newest snapshot if the live
     store is missing — e.g. a fresh extract landed over the folder. */
  try {
    await guardAtBoot(ROOT);
  } catch (err) {
    console.warn("content backup skipped:", err?.message || err);
  }
  return createCmsHost(ROOT);
})();
const geoProxy = createGeoProxy();

/* The recent-services list stays fresh by itself: every 20 minutes the channel
   is re-read and the bake in seed.json refreshed, and a changed list rides the
   normal auto-deploy out to every copy (git + live feed), with no publish and
   no command. A Sunday's service lands on the deployed sites on its own. */
try {
  const [{ bakeRecent }, { notePublished }] = await Promise.all([import("./bake-recent.mjs"), import("./auto-push.mjs")]);
  const refreshRecent = async () => {
    try {
      const r = await bakeRecent(ROOT);
      if (r && r.changed) {
        console.log(`recent services refreshed (${r.count} services) — pushing to every copy`);
        notePublished(ROOT);
      }
    } catch (err) {
      console.warn("recent services refresh skipped:", err?.message || err);
    }
  };
  setInterval(refreshRecent, 20 * 60 * 1000);
  refreshRecent();
} catch {
  /* a bake that cannot load never stops the server */
}

/* Attached sharing: with sharing on (auto-share.txt, see scripts/expose.mjs),
   this machine joins every deployed copy to itself on every boot — tunnel,
   registration and push, with no command. Runs beside the server, never ahead
   of it: a failure here only logs, the site itself is unaffected. */
try {
  const { shareWanted, attachShare } = await import("./expose.mjs");
  if (await shareWanted(ROOT)) {
    attachShare().catch((err) => console.warn("auto-share skipped:", err?.message || err));
  }
} catch {
  /* sharing unavailable — the site itself is unaffected */
}

/* Editing? Use `npm run dev` (Vite refreshes on every save).
   This server serves the production build. */

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

    /* The office server doubles as the deployed site's backend: browsers from
       anywhere may read it (the published content is public; writes take the
       admin password and stay rate-limited as always). */
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    /* A public page (the hosted site, opened on this same computer) may probe
       and join this server over loopback: Chrome's private-network check
       needs this header on the preflight and the answer. */
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === "/scripts/local-shim.js" && req.method === "GET") {
      const shim = await readFile(path.join(ROOT, "scripts", "local-shim.js"), "utf8");
      const body = shim.split("__SITE_VERSION__").join(SITE_VERSION);
      sendBody(req, res, body, "text/javascript; charset=utf-8", "shim-" + hashText(body));
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

    /* Local file uploads: the Platform upload service only exists on the live
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

    /* Backup restore: puts one embedded upload back under its exact stored
       name, so restored content points at the same addresses it always did.
       Same file rules as /__upload; anything outside the server's own naming
       pattern is refused. Uploads are never deleted by the server — they sit
       in data/uploads/ until the office removes them by hand. */
    if (pathname === "/__restore-file" && req.method === "POST") {
      const ctype = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (!ctype.startsWith("image/") && !ctype.startsWith("video/")) {
        res.writeHead(400, { "cache-control": "no-store" });
        res.end("bad filetype");
        return;
      }
      const asked = String(url.searchParams.get("name") || "");
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(asked) || asked.includes("..")) {
        res.writeHead(400, { "cache-control": "no-store" });
        res.end("bad name");
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
          const dir = path.join(ROOT, "data", "uploads");
          await mkdir(dir, { recursive: true });
          await writeFile(path.join(dir, asked), Buffer.concat(chunks));
          const body = JSON.stringify({ url: "/data/uploads/" + asked, restored: true });
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

    /* Delete an upload for good: it leaves data/uploads/ and stops riding in
       backups afterwards. Same naming guard as the other file endpoints. */
    if (pathname === "/__delete-file" && req.method === "POST") {
      const asked = String(url.searchParams.get("name") || "");
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(asked) || asked.includes("..")) {
        res.writeHead(400, { "cache-control": "no-store" });
        res.end("bad name");
        return;
      }
      try {
        const target = path.join(ROOT, "data", "uploads", asked);
        const st = await stat(target).catch(() => null);
        if (!st || !st.isFile()) {
          res.writeHead(404, { "cache-control": "no-store" });
          res.end("not found");
          return;
        }
        await rm(target, { force: true });
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify({ deleted: true }));
      } catch {
        res.writeHead(500, { "cache-control": "no-store" });
        res.end("delete failed");
      }
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
        /* No-disk survival (note 290): an emptied live store answers
           getContent from the baked seed instead of blank. */
        const outBody = await answerWithSeedFallback(rpcMatch[1], r.body, ROOT, DIST);
        res.writeHead(r.status, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(outBody);
      });
      return;
    }

    let rel = decodeURIComponent(pathname).replace(/^\/+/, "");
    if (!rel) rel = "index.html";
    const roots = rel.startsWith("data/uploads/") ? [ROOT, DIST] : [DIST];
    let file = path.normalize(path.join(roots[0], rel));
    if (!file.startsWith(roots[0])) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    let st = await stat(file).catch(() => null);
    if ((!st || !st.isFile()) && roots.length > 1) {
      const alt = path.normalize(path.join(roots[1], rel));
      const altSt = await stat(alt).catch(() => null);
      if (altSt && altSt.isFile()) {
        file = alt;
        st = altSt;
      }
    }
    if ((!st || !st.isFile()) && !pathname.startsWith("/__cms/")) {
      /* Standalone nicety: unknown paths (e.g. /admin) serve the app so the
         router can resolve them. */
      const shell = await readFile(path.join(DIST, "index.html"), "utf8");
      const body = Buffer.from(withShim(shell));
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
    if (path.basename(file) === "index.html") {
      body = Buffer.from(withShim(body.toString("utf8")));
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
    /* Update stamp + baked content pointers (note 302): always fresh, so a
       normal reload right after an update sees the new numbers at once — a
       cached version.json is how the notice looked "vanished" until Ctrl+Shift+R. */
    const base = path.basename(file);
    if (base === "version.json" || base === "seed.json" || base === "server.json" || base === "feed.json") {
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
  console.log(`Site + admin backend at http://localhost:${PORT}/  (admin: /admin) — production build, update ${SRC_NOTES || DIST_NOTES || "?"}`);
});
