// `npm run vite` — run the site in VS Code with Vite instead of `npm run dev`.
//
// Same site, same admin backend, same content: this config only swaps the
// *server*. Vite serves src/main.tsx directly (instant Hot Module Reload while
// you edit), and the plugin below wires in the site's own publishing backend
// (scripts/cms-local.mjs — the exact server code from index.html) plus the
// local YouTube proxy, so Publish, sign-in, recent services and the live badge
// all behave exactly like the Perchance preview.
//
// Run it:  npm install   (once — downloads react, vite, …)
//          npm run vite  (opens http://localhost:5173/, admin at /admin)

import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { createCmsHost, hashText } from "./scripts/cms-local.mjs";
import { createGeoProxy } from "./scripts/geo-proxy.mjs";

const APP_TAG = '<script type="module" src="src/app.js"></script>';
const CSS_TAG = '<link rel="stylesheet" href="src/app.css">';

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/* The admin backend for `vite dev`: the site's own publishing code running in
   Node, byte for byte the same as `npm run dev` (see scripts/serve.mjs). */
function cmsBackend() {
  const ROOT = process.cwd();
  const geoProxy = createGeoProxy();
  let cms = null;
  let siteVersion = "vite";
  return {
    name: "wom-cms-backend",
    async configResolved() {
      const html = await readFile(path.join(ROOT, "index.html"), "utf8");
      siteVersion = "vite-" + hashText(html);
      cms = await createCmsHost(ROOT);
    },
    /* Perchance preview loads the prebuilt bundle; under Vite the entry is
       the source itself (with HMR), plus the shim that connects it to the
       backend below. The stale prebuilt stylesheet is dropped so styles also
       hot-reload from src/styles/*.css. */
    transformIndexHtml(html) {
      return html
        .split(CSS_TAG).join("")
        .split(APP_TAG).join(
          '<script src="/scripts/local-shim.js"></script>\n  <script type="module" src="/src/main.tsx"></script>'
        );
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url || "/", "http://localhost");
          const pathname = url.pathname;

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

          /* Local file uploads: the Perchance upload service only exists on the
             live site, so local runs keep the office's photos and videos on
             their own disk (data/uploads/). */
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

          if ((pathname === "/__geo" || pathname === "/__rates") && req.method === "GET") {
            if (pathname === "/__geo") await geoProxy.handleGeo(req, res);
            else await geoProxy.handleRates(req, res);
            return;
          }

          /* Local YouTube proxy (YouTube sends no CORS headers; the
             superFetch plugin only exists on the live site). */
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

export default {
  plugins: [react(), cmsBackend()],
  server: { port: 5173 },
  define: { "process.env.NODE_ENV": '"production"' },
};
