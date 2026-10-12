/* vite-cms-backend.mjs — the site's own publishing backend for `npm run dev`.
   Same content code as the office server (scripts/serve.mjs): sign-in,
   publishing, uploads, live updates, plus the local YouTube/geo proxies —
   so dev behaves exactly like production. */

import { readFile, stat, mkdir, writeFile, cp, rm } from "node:fs/promises";
import path from "node:path";
import { createCmsHost, hashText } from "./cms-local.mjs";
import { isLoopbackAddr } from "./live-follow.mjs";
import { answerWithSeedFallback } from "./seed-fallback.mjs";
import { guardAtBoot } from "./backup-data.mjs";
import { createGeoProxy } from "./geo-proxy.mjs";
import { MIME } from "./mime.mjs";

/* index.html points straight at the source entry — no prebuilt bundle involved. */
const ENTRY_TAG = '<script type="module" src="/src/main.tsx"></script>';
const SHIM_TAG = '<script src="/scripts/local-shim.js"></script>';

/* The admin backend for `npm run dev`: the site's own publishing code running
   in Node — the same backend scripts/serve.mjs runs in production. */
export function cmsBackend() {
  const ROOT = process.cwd();
  const geoProxy = createGeoProxy();
  let cms = null;
  let siteVersion = "vite";
  let outDir = path.join(ROOT, "dist");
  return {
    name: "wom-cms-backend",
    async configResolved(config) {
      const html = await readFile(path.join(ROOT, "index.html"), "utf8");
      siteVersion = "vite-" + hashText(html);
      /* Announce the update on every dev boot (note 248): with several
         extracts on one machine, the terminal names which one is running. */
      try {
        const src = await readFile(path.join(ROOT, "src", "lib", "hooks.ts"), "utf8");
        const n = Number((src.match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
        if (n) console.log(`dev server: site update ${n} (Admin > Tools shows the same number)`);
      } catch {
        /* stamp unreadable — the page stamp still shows */
      }
      try {
        await guardAtBoot(ROOT);
      } catch {
        /* same snapshot-and-recover as scripts/serve.mjs — never fatal */
      }
      cms = await createCmsHost(ROOT);
      outDir = path.resolve(config.root || ROOT, (config.build && config.build.outDir) || "dist");
    },
    /* Dev only: the shim connects the page to this backend (sign-in, publish,
       uploads). Production builds stay backend-free — deployed copies join the
       office server through server.json instead. */
    transformIndexHtml(html, ctx) {
      if (!ctx || !ctx.server) return undefined;
      const src = String(html);
      if (src.includes(SHIM_TAG)) return undefined;
      if (src.includes(ENTRY_TAG)) return src.replace(ENTRY_TAG, SHIM_TAG + "\n    " + ENTRY_TAG);
      return src + "\n" + SHIM_TAG + "\n";
    },
    /* `vite build` extras: the string-URL files the app points at (photos), plus
       a snapshot of the published content (data/cms-state.bin) as seed.json so
       the static site opens on the office's words with no backend to ask. */
    async closeBundle() {
      if (process.env.VITE_WOM_SKIP_STATIC === "1") return;
      try {
        await mkdir(outDir, { recursive: true });
        await cp(path.join(ROOT, "src", "assets"), path.join(outDir, "src", "assets"), { recursive: true });
      } catch (err) {
        console.warn("static assets not copied:", err?.message || err);
      }
      try {
        const st = await stat(path.join(ROOT, "data", "uploads")).catch(() => null);
        if (st && st.isDirectory()) {
          await cp(path.join(ROOT, "data", "uploads"), path.join(outDir, "data", "uploads"), { recursive: true });
        }
      } catch (err) {
        console.warn("uploads not copied:", err?.message || err);
      }
      try {
        if (cms) {
          cms.openConn("bake");
          const r = await cms.call("getContent", "bake", "");
          const res = JSON.parse(r.body);
          const sections = res && res.sections ? JSON.parse(res.sections) : {};
          /* Carry the publish stamp like bake-seed.mjs does (note 302): a
             notes-less seed would read as "nothing ever published" and hold
             even a fully-published deploy on maintenance until the next bake. */
          let notes = typeof res.notes === "number" && res.notes > 0 ? Math.floor(res.notes) : 0;
          /* …and the publish history with it (note 303): without log/by/at a
             host restart clears "Last published" in the admin console. */
          let log = Array.isArray(res.log) ? res.log.slice(0, 20) : [];
          let by = typeof res.by === "string" ? res.by.slice(0, 60) : "";
          let at = typeof res.at === "number" ? res.at : 0;
          if (!notes && !log.length && !by && !at) {
            try {
              const prev = JSON.parse(await readFile(path.join(outDir, "seed.json"), "utf8"));
              if (typeof prev?.notes === "number" && prev.notes > 0) notes = Math.floor(prev.notes);
              if (Array.isArray(prev?.log)) log = prev.log.slice(0, 20);
              if (typeof prev?.by === "string") by = prev.by.slice(0, 60);
              if (typeof prev?.at === "number") at = prev.at;
            } catch {}
          }
          await writeFile(path.join(outDir, "seed.json"), JSON.stringify({ rev: typeof res.rev === "number" ? res.rev : 0, notes, sections, log, by, at }));
          console.log(`baked ${Object.keys(sections).length} published sections into seed.json`);
        }
      } catch (err) {
        console.warn("seed.json not baked:", err?.message || err);
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url || "/", "http://localhost");
          const pathname = url.pathname;

          /* Same open door as scripts/serve.mjs: this backend also serves
             deployed copies pointed at it (see src/lib/remoteserver.ts). */
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "content-type");
          if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
          }

          /* Bundled photos are plain string URLs (src/data/photos.ts), never
             imports — Vite would 404 them, so serve them from disk here. */
          if (pathname.startsWith("/src/assets/") && req.method === "GET") {
            const file = path.normalize(path.join(ROOT, pathname.replace(/^\/+/, "")));
            if (!file.startsWith(ROOT)) {
              res.writeHead(403);
              res.end("forbidden");
              return;
            }
            const st = await stat(file).catch(() => null);
            if (!st || !st.isFile()) return next();
            const body = await readFile(file);
            res.writeHead(200, {
              "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
              "content-length": body.length,
              "cache-control": "no-cache",
            });
            res.end(body);
            return;
          }

          /* Uploads the office saved on their own disk (see /__upload below) —
             plain files Vite would otherwise 404. */
          if (pathname.startsWith("/data/uploads/") && req.method === "GET") {
            const file = path.normalize(path.join(ROOT, pathname.replace(/^\/+/, "")));
            if (!file.startsWith(ROOT)) {
              res.writeHead(403);
              res.end("forbidden");
              return;
            }
            const st = await stat(file).catch(() => null);
            if (!st || !st.isFile()) return next();
            const body = await readFile(file);
            res.writeHead(200, {
              "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
              "content-length": body.length,
              "cache-control": "no-cache",
            });
            res.end(body);
            return;
          }

          if (pathname === "/scripts/local-shim.js" && req.method === "GET") {
            const shim = await readFile(path.join(ROOT, "scripts", "local-shim.js"), "utf8");
            const body = shim.split("__SITE_VERSION__").join(siteVersion);
            res.writeHead(200, {
              "content-type": "text/javascript; charset=utf-8",
              "content-length": Buffer.byteLength(body),
              "cache-control": "no-store",
            });
            res.end(body);
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
            cms.attachSender(id, (text) => {
              for (const line of String(text).split("\n")) res.write("data: " + line + "\n");
              res.write("\n");
            });
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

          const rpcMatch = pathname.match(/^\/__cms\/([A-Za-z0-9_]+)$/);
          if (rpcMatch && req.method === "POST") {
            const id = url.searchParams.get("conn") || "anon";
            /* Live-follow adoption (note 343) opens to this machine only. */
            if (rpcMatch[1] === "adoptLive" && !isLoopbackAddr(req.socket && req.socket.remoteAddress)) {
              res.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
              res.end(JSON.stringify({ ok: false, err: "denied" }));
              return;
            }
            let body = "";
            req.setEncoding("utf8");
            req.on("data", (chunk) => {
              body += chunk;
              if (body.length > 8 * 1024 * 1024) req.destroy();
            });
            req.on("end", async () => {
              const r = await cms.call(rpcMatch[1], id, body);
              /* Same no-disk net as scripts/serve.mjs (note 290): an emptied
                 live store answers getContent from the baked seed. */
              const outBody = await answerWithSeedFallback(rpcMatch[1], r.body, ROOT, outDir);
              res.writeHead(r.status, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              });
              res.end(outBody);
            });
            return;
          }

          /* File uploads: the office's photos and videos are kept on their own
             disk (data/uploads/). */
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
                res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
                res.end(JSON.stringify({ url: "/data/uploads/" + fname }));
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

          /* Backup restore (note 307): same as scripts/serve.mjs — puts one
             embedded upload back under its exact stored name, so a live
             backup restored on local (`npm run dev`) brings its photos and
             videos home instead of silently losing them. */
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

          /* Delete an upload for good (note 307): same as scripts/serve.mjs. */
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

          /* Live address for the two-way sync (note 308): office copies ask this
             door where "live" is (the first origin in cms-server.txt). */
          if (pathname === "/__live-url" && req.method === "GET") {
            let live = "";
            try {
              const raw = await readFile(path.join(ROOT, "cms-server.txt"), "utf8").catch(() => "");
              const first = String(raw).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))[0] || "";
              const clean = first.replace(/\/+$/, "");
              if (/^https?:\/\/[^/\s]+$/i.test(clean)) live = clean;
            } catch { /* standalone — no live address */ }
            const body = JSON.stringify({ url: live });
            res.writeHead(200, {
              "content-type": "application/json; charset=utf-8",
              "content-length": Buffer.byteLength(body),
              "cache-control": "no-store",
            });
            res.end(body);
            return;
          }

          if ((pathname === "/__geo" || pathname === "/__rates") && req.method === "GET") {
            if (pathname === "/__geo") await geoProxy.handleGeo(req, res);
            else await geoProxy.handleRates(req, res);
            return;
          }

          /* Same-origin YouTube proxy (YouTube sends no CORS headers, so the
             browser cannot read it directly). */
          if (pathname === "/__yt" && req.method === "GET") {
            const target = url.searchParams.get("url") || "";
            let host = "";
            try {
              host = new URL(target).hostname.toLowerCase();
            } catch {
              host = "";
            }
            const allowed =
              host === "www.youtube.com" || host === "youtube.com" ||
              host === "m.youtube.com" || host === "youtu.be";
            if (!allowed) {
              res.writeHead(400, { "cache-control": "no-store" });
              res.end("bad url");
              return;
            }
            try {
              const upstream = await fetch(target, {
                headers: {
                  "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
                  "accept-language": "en-US,en;q=0.9",
                },
              });
              const text = await upstream.text();
              if (!upstream.ok || !text) {
                res.writeHead(502, { "cache-control": "no-store" });
                res.end("unreachable");
                return;
              }
              res.writeHead(200, {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "no-store",
              });
              res.end(text);
              return;
            } catch {
              res.writeHead(502, { "cache-control": "no-store" });
              res.end("unreachable");
              return;
            }
          }

          next();
        } catch {
          res.writeHead(500);
          res.end("server error");
        }
      });
    },
  };
}

