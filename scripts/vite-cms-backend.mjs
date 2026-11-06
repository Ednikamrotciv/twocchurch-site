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
import { createSecurityLog } from "./security-log.mjs";
import { createWaf, getClientIp, isSafePath, endpointCategory, ipClass, normalizeIp } from "./waf.mjs";
import { createSessionAnomaly } from "./session-anomaly.mjs";
import { createPublishWatch } from "./publish-watch.mjs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

/* index.html points straight at the source entry — no prebuilt bundle involved. */
const ENTRY_TAG = '<script type="module" src="/src/main.tsx"></script>';
const SHIM_TAG = '<script src="/scripts/local-shim.js"></script>';

/* The admin backend for `npm run dev`: the site's own publishing code running
   in Node — the same backend scripts/serve.mjs runs in production. */
export function cmsBackend() {
  const ROOT = process.cwd();
  /* Fresh-deploy ritual for local dev (office request: every `npm run dev`
     opens like a new deploy — the maintenance notice holds until Publish and
     the copy stages welcome-only until Recover + Publish, just like the
     deployed site). A fresh opaque deploy ID is minted per dev-server boot
     and stamped into the entry page below (meta wom-deploy, the same stamp
     build-static.mjs bakes per build) plus the dev version.json beside it,
     so the client takes its deploy-lock path instead of the number gate
     (which released forever after the first local publish). The office disk
     is untouched — Recover restores it, Publish folds it in — and a Publish
     from this boot stamps this ID server-side through the normal
     durableDeploy path, releasing the hold. */
  const devDeployId =
    "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const geoProxy = createGeoProxy();
  let cms = null;
  /* Security shield for `npm run dev` (same as scripts/serve.mjs): WAF in
     front of every request, session anomaly detection, and a real-time
     terminal log with severity + IP + hint. Zero deps — dev stays fast and
     deploys stay short. Maintenance / clean-deploy / live-relay untouched. */
  let secLog = null;
  let waf = null;
  let anomaly = null;
  const lastIpByConn = new Map();
  try {
    secLog = createSecurityLog({ rootDir: ROOT, service: "dev" });
    waf = createWaf();
    anomaly = createSessionAnomaly({ log: (e) => secLog.log(e) });
  } catch {
    secLog = null;
    waf = null;
    anomaly = null;
  }
  function devClientIp(req) {
    // Same spoof-safe rule as production (see scripts/serve.mjs): forwarded
    // headers count only behind a trusted proxy or a loopback/private remote.
    // In local dev the remote IS the loopback client, so ::1/127.0.0.1 is
    // used verbatim and normalized to one spelling.
    try {
      return getClientIp(req, !!process.env.RENDER || process.env.TRUST_PROXY === "1");
    } catch {
      return "-";
    }
  }
  function devReqId() {
    try {
      return Math.random().toString(36).slice(2, 10);
    } catch {
      return "r0";
    }
  }
  function devIpNetNum(ip) {
    try {
      return createHash("sha256").update("wom-net|" + normalizeIp(ip)).digest().readUInt32BE(0);
    } catch {
      return 0;
    }
  }
  function devRpcAnomaly({ connId, rpc, ok, err }) {
    try {
      if (anomaly) anomaly.observeRpc({ connId, ip: lastIpByConn.get(String(connId || "")) || "-", rpc, ok, err });
    } catch {}
  }
  async function devLiveUrl() {
    try {
      const raw = await readFile(path.join(ROOT, "cms-server.txt"), "utf8").catch(() => "");
      const first = String(raw).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))[0] || "";
      const clean = first.replace(/\/+$/, "");
      if (/^https?:\/\/[^/\s]+$/i.test(clean)) return clean;
    } catch {}
    return "";
  }
  /* First-Publish proof in dev too (same as serve.mjs): after every successful
     local publish, confirm the live box has it — or say exactly why others
     still wait. Runtime only, never the build. */
  let publishWatch = null;
  try {
    publishWatch = createPublishWatch({
      getOfficeStamp: async () => {
        try {
          if (!cms) return null;
          const r = await cms.call("contentRev", "publish-watch", "");
          if (!r || r.status !== 200) return null;
          const d = JSON.parse(r.body);
          if (!d || d.ok !== true) return null;
          return { rev: Math.floor(Number(d.rev)) || 0, notes: Math.floor(Number(d.notes)) || 0, at: Number(d.at) || 0 };
        } catch {
          return null;
        }
      },
      getLiveUrl: devLiveUrl,
      log: (e) => {
        try {
          if (secLog) secLog.log(e);
        } catch {}
      },
    });
  } catch {
    publishWatch = null;
  }
  /* HIGH fix — file-door guard (same as scripts/serve.mjs): uploads,
     restores and deletes take a signed-in admin connection (?conn=). */
  async function isAdminConn(id) {
    try {
      if (!id || !cms) return false;
      const r = await cms.call("checkAdmin", id, "");
      if (!r || r.status !== 200) return false;
      const data = JSON.parse(r.body);
      return !!(data && data.ok === true && data.admin === true);
    } catch {
      return false;
    }
  }
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
        if (n) console.log(`dev server: site update ${n} (version.json shows the same number)`);
      } catch {
        /* stamp unreadable — the page stamp still shows */
      }
      try {
        await guardAtBoot(ROOT);
      } catch {
        /* same snapshot-and-recover as scripts/serve.mjs — never fatal */
      }
      console.log(`dev server: fresh deploy ${devDeployId} — maintenance holds until Publish, staged welcome-only until Recover + Publish (like a new deploy; the office disk is untouched)`);
      /* Follow live only while serving (note 378): this hook also runs for
         `vite build`, where a minute loop would hold the build process open
         forever — exactly how the Vercel deploy got stuck. */
      const serving = !!(config && config.command === "serve");
      cms = await createCmsHost(ROOT, serving
        ? {
          follow: true,
          onRpc: ({ method, id, status, body }) => {
            try {
              const m = String(method || "");
              const b = typeof body === "string" ? body : "";
              const ok = status === 200 && !/"ok"\s*:\s*false/.test(b.slice(0, 4000));
              let err = "";
              const em = /"err"\s*:\s*"([^"]{1,40})"/.exec(b.slice(0, 4000));
              if (em) err = em[1];
              devRpcAnomaly({ connId: id, rpc: m, ok, err });
              if (m === "publish" && ok && publishWatch) publishWatch.noteOfficePublish();
            } catch {}
          },
        }
        : undefined);
      try {
        if (serving && secLog) {
          // Dev shield line: the SAME module as production, but this line is
          // honest that it runs in dev (vite-safe paths exempt from rate
          // counting; every signature scan still applies). Production is
          // guarded by scripts/serve.mjs — never assume this dev line covers
          // the deployed site.
          let persistNote = "";
          try {
            const p = secLog.getPersistence();
            persistNote = p.persistent ? `evidence PERSISTENT at ${p.dir}` : `evidence EPHEMERAL (${p.reason})`;
          } catch {}
          secLog.log({ level: "info", kind: "shield-on", ip: "-", route: "-", detail: `WAF + session-anomaly shield active in DEV (same server-side module as prod; Vite dev paths exempt from rate counting, all signature scans apply) — ${persistNote}`, hint: "every [SEC] line below is also saved to data/security-events.jsonl; unique incidents auto-write data/security-report-latest.pdf", source: "local" });
          // 7-area posture board in this terminal too (info only — never a PDF trigger).
          try {
            const { runSecurityChecks } = await import("./security-checks.mjs");
            const rows = await runSecurityChecks(ROOT);
            const useColor = !process.env.NO_COLOR;
            const C = { redBg: "\x1b[41m\x1b[37m", yellow: "\x1b[33m", green: "\x1b[32m", grey: "\x1b[90m", reset: "\x1b[0m" };
            console.log(" SECURITY POSTURE — 7 areas (RED ALERT = attack; WARNING/NOTICE = operational, not an attack)");
            for (const r of rows) {
              const c = r.status === "RED ALERT" ? C.redBg : r.status === "WARNING" ? C.yellow : r.status === "SECURE" ? C.green : C.grey;
              console.log(`  ${(useColor ? c : "")}${String(r.area).slice(0, 42).padEnd(42)} | ${r.status}${(useColor ? C.reset : "")}${r.status === "RED ALERT" ? "  <-- RED ALERT" : ""} — ${String(r.detail).slice(0, 160)}`);
            }
          } catch {}
          secLog.startLiveWatch({ getLiveUrl: devLiveUrl, intervalMs: 60000 });
        }
      } catch {}
      outDir = path.resolve(config.root || ROOT, (config.build && config.build.outDir) || "dist");
    },
    /* Dev only: the shim connects the page to this backend (sign-in, publish,
       uploads). Production builds stay backend-free — deployed copies join the
       office server through server.json instead. */
    transformIndexHtml(html, ctx) {
      if (!ctx || !ctx.server) return undefined;
      let src = String(html);
      /* Fresh-deploy ritual (see above): stamp this boot's deploy ID into the
         entry page, like build-static.mjs stamps each build — the client's
         deploy lock reads it synchronously on first paint. */
      if (!src.includes('name="wom-deploy"')) {
        const tag = '<meta name="wom-deploy" content="' + devDeployId + '">';
        if (src.includes("</head>")) src = src.replace("</head>", "  " + tag + "\n</head>");
        else src = tag + "\n" + src;
      }
      if (src.includes(SHIM_TAG)) return src === html ? undefined : src;
      if (src.includes(ENTRY_TAG)) return src.replace(ENTRY_TAG, SHIM_TAG + "\n    " + ENTRY_TAG);
      return src + "\n" + SHIM_TAG + "\n";
    },
    /* `vite build` extras: the string-URL files the app points at (photos), plus
       a snapshot of the published content (data/cms-state.bin) as seed.json so
       the static site opens on the office's words with no backend to ask. */
    async closeBundle() {
      /* Fast frontend deploys: `npm run build` runs build-static.mjs right
         after this, which bakes seed.json + copies assets itself — doing it
         here too doubles the disk work and the YouTube read (bakeRecent's
         network timeout) on every deploy. So under `npm run build` (or an
         explicit VITE_WOM_SKIP_STATIC=1) this step stands down and lets
         build-static.mjs do the single bake. Direct `vite build` calls and
         `npm run dev` keep the old behavior. */
      if (process.env.VITE_WOM_SKIP_STATIC === "1" || process.env.npm_lifecycle_event === "build") return;
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
          /* Clean-deploy flag (like bake-seed.mjs): with clean-deploy.txt
             beside package.json the deploy preview bakes no words — the
             office opens clean until Recover + Publish. */
          let cleanDeploy = false;
          try {
            await readFile(path.join(ROOT, "clean-deploy.txt"), "utf8");
            cleanDeploy = true;
          } catch {}
          if (cleanDeploy) {
            console.log("clean deploy requested (clean-deploy.txt) — dev bake ships no words");
            await writeFile(path.join(outDir, "seed.json"), JSON.stringify({ rev: 0, notes: 0, sections: {}, log: [], by: "", at: 0 }));
            console.log(`baked 0 published sections into seed.json`);
            return;
          }
          /* Carry the publish stamp like bake-seed.mjs does (note 302): a
             notes-less seed would read as "nothing ever published" and hold
             even a fully-published deploy on maintenance until the next bake. */
          let notes = typeof res.notes === "number" && res.notes > 0 ? Math.floor(res.notes) : 0;
          /* …and the publish history with it (note 303): without log/by/at a
             host restart clears "Last published" in the admin console. */
          let log = Array.isArray(res.log) ? res.log.slice(0, 20) : [];
          let by = typeof res.by === "string" ? res.by.slice(0, 60) : "";
          let at = typeof res.at === "number" ? res.at : 0;
          let publishedDeploy = typeof res.publishDeploy === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(res.publishDeploy) ? res.publishDeploy : "";
          if (!notes && !log.length && !by && !at) {
            try {
              const prev = JSON.parse(await readFile(path.join(outDir, "seed.json"), "utf8"));
              if (typeof prev?.notes === "number" && prev.notes > 0) notes = Math.floor(prev.notes);
              if (Array.isArray(prev?.log)) log = prev.log.slice(0, 20);
              if (typeof prev?.by === "string") by = prev.by.slice(0, 60);
              if (typeof prev?.at === "number") at = prev.at;
            } catch {}
          }
          await writeFile(path.join(outDir, "seed.json"), JSON.stringify({ rev: typeof res.rev === "number" ? res.rev : 0, notes, sections, log, by, at, ...(publishedDeploy ? { publishedDeploy } : {}) }));
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
          res.setHeader("X-Frame-Options", "SAMEORIGIN");
          res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
          if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
          }

          // --- WAF front door (dev): same shield as serve.mjs.
          const client = devClientIp(req);
          const rid = devReqId();
          const connId = url.searchParams.get("conn") || "anon";
          try {
            lastIpByConn.set(String(connId || "anon"), client);
          } catch {}
          try {
            if (cms && typeof cms.setConnNet === "function") cms.setConnNet(connId, devIpNetNum(client));
          } catch {}
          const quiet = isSafePath(pathname, req.method);
          try {
            if (anomaly) anomaly.observe({ connId, ip: client, route: pathname, method: req.method, ua: String((req.headers && req.headers["user-agent"]) || "").slice(0, 120), quiet, netClass: ipClass(client) });
          } catch {}
          try {
            if (waf) {
              const verdict = waf.checkRequest({ method: req.method, pathname, search: url.search || "", headers: req.headers, ip: client });
              if (!verdict.allow) {
                const cont = !!verdict.continuation;
                const status = Number(verdict.status) || (cont ? 429 : 403);
                if (secLog) secLog.log({ level: cont ? "info" : verdict.severity || "high", kind: cont ? "rate-throttle" : status === 429 ? "rate-limit" : "waf-block", ip: client, route: pathname, detail: verdict.reason, hint: verdict.hint, category: verdict.category || endpointCategory(pathname, req.method), status, reqId: rid, source: "local" });
                const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
                if (verdict.retryAfter) headers["retry-after"] = String(verdict.retryAfter);
                res.writeHead(status, headers);
                res.end(JSON.stringify({ ok: false, err: status === 429 ? "rate-limited" : "forbidden" }));
                return;
              }
            }
          } catch {
            /* fail-open */
          }

          // --- Security evidence doors (signed-in admin only, server-side check).
          if (pathname === "/__security/events.json" && req.method === "GET") {
            if (!(await isAdminConn(String(url.searchParams.get("conn") || "")))) {
              try {
                if (anomaly) anomaly.observeFileDeny({ connId, ip: client, route: pathname });
              } catch {}
              try {
                if (secLog) secLog.log({ level: "low", kind: "file-deny", ip: client, route: pathname, detail: "unauthenticated /__security/events.json attempt denied (403)", hint: "one-offs are mistyped links; repeats escalate automatically.", category: "security", status: 403, reqId: rid, source: "local" });
              } catch {}
              res.writeHead(403, { "cache-control": "no-store" });
              res.end("denied");
              return;
            }
            const body = JSON.stringify({ ok: true, events: secLog ? secLog.getEvents(200) : [], incidents: secLog ? secLog.getIncidents(100) : [] });
            res.writeHead(200, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
            res.end(body);
            return;
          }
          if (pathname === "/__security/report.pdf" && req.method === "GET") {
            if (!(await isAdminConn(String(url.searchParams.get("conn") || "")))) {
              try {
                if (anomaly) anomaly.observeFileDeny({ connId, ip: client, route: pathname });
              } catch {}
              try {
                if (secLog) secLog.log({ level: "low", kind: "file-deny", ip: client, route: pathname, detail: "unauthenticated /__security/report.pdf attempt denied (403)", hint: "report PDFs need a signed-in admin conn (?conn=).", category: "security", status: 403, reqId: rid, source: "local" });
              } catch {}
              res.writeHead(403, { "cache-control": "no-store" });
              res.end("denied");
              return;
            }
            const evts = secLog ? secLog.getEvents(1000).reverse() : [];
            const pdf = secLog ? secLog.buildPdf() : Buffer.from("%PDF-1.4\n%EOF", "latin1");
            try {
              if (secLog) secLog.log({ level: "info", kind: "pdf-download", ip: client, route: pathname, detail: `admin downloaded security PDF (${evts.length} events)`, category: "security", status: 200, reqId: rid, source: "local" });
            } catch {}
            res.writeHead(200, { "content-type": "application/pdf", "content-length": pdf.length, "cache-control": "no-store", "content-disposition": 'attachment; filename="security-report.pdf"' });
            res.end(pdf);
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
              "x-content-type-options": "nosniff",
              "content-security-policy": "sandbox",
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
              "x-content-type-options": "nosniff",
              "content-security-policy": "sandbox",
            });
            res.end(body);
            return;
          }

          /* Fresh-deploy ritual (see above): the dev version.json names this
             boot's deploy ID, so the stale-build check agrees with the entry
             page instead of reloading onto a "newer" deploy. Best effort —
             without it the check simply skips, as before. */
          if (pathname === "/version.json" && req.method === "GET") {
            let notes = 0;
            let code = "";
            try {
              const hooksSrc = await readFile(path.join(ROOT, "src", "lib", "hooks.ts"), "utf8");
              notes = Number((hooksSrc.match(/BUILD_NOTES = (\d+)/) || [])[1]) || 0;
              const word = /CODE_ID\s*=\s*"([A-Za-z0-9_-]{1,40})"/.exec(String(hooksSrc));
              if (word) code = word[1];
            } catch { /* the deploy ID below is what matters */ }
            const body = JSON.stringify({ notes, code, deployId: devDeployId });
            res.writeHead(200, {
              "content-type": "application/json; charset=utf-8",
              "content-length": Buffer.byteLength(body),
              "cache-control": "no-store",
            });
            res.end(body);
            return;
          }

          if (pathname === "/scripts/local-shim.js" && req.method === "GET") {            const shim = await readFile(path.join(ROOT, "scripts", "local-shim.js"), "utf8");
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
            try {
              lastIpByConn.set(String(id || "anon"), client);
            } catch {}
            try {
              if (cms && typeof cms.setConnNet === "function") cms.setConnNet(id, devIpNetNum(client));
            } catch {}
            /* Live-follow adoption (note 344) opens to this machine only. */
            if (rpcMatch[1] === "adoptLive" && !isLoopbackAddr(req.socket && req.socket.remoteAddress)) {
              try {
                if (secLog) secLog.log({ level: "high", kind: "privilege-escalation", ip: client, route: pathname, detail: "non-loopback adoptLive rejected (dev)", hint: "adoptLive is loopback + per-boot token only.", category: "api-publish", status: 403, reqId: rid, source: "local" });
              } catch {}
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
              try {
                if (waf) {
                  const bv = waf.checkBody({ rpc: rpcMatch[1], body, ip: client });
                  if (!bv.allow) {
                    const cont = !!bv.continuation;
                    const status = Number(bv.status) || (cont ? 429 : 403);
                    if (secLog) secLog.log({ level: cont ? "info" : bv.severity || "high", kind: cont ? "rate-throttle" : status === 429 ? "rate-limit" : "waf-block", ip: client, route: pathname, detail: bv.reason, hint: bv.hint, category: bv.category || "api", status, reqId: rid, source: "local" });
                    const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
                    if (bv.retryAfter) headers["retry-after"] = String(bv.retryAfter);
                    res.writeHead(status, headers);
                    res.end(JSON.stringify({ ok: false, err: status === 429 ? "rate-limited" : "forbidden" }));
                    return;
                  }
                }
              } catch {}
              const r = await cms.call(rpcMatch[1], id, body);
              try {
                const preview = typeof r.body === "string" ? r.body.slice(0, 2000) : "";
                const denied = /"ok"\s*:\s*false/.test(preview);
                if ((rpcMatch[1] === "login" || rpcMatch[1] === "login2fa") && denied && secLog) {
                  secLog.log({ level: "low", kind: "auth-fail", ip: client, route: pathname, detail: `${rpcMatch[1]} denied in dev (session ${id})`, hint: "a few is mistyping; a burst escalates via auth-probing (already rate-limited).", category: "api-auth", status: 200, reqId: rid, source: "local" });
                } else if (rpcMatch[1] === "publish" && !denied && secLog) {
                  secLog.log({ level: "info", kind: "publish", ip: client, route: pathname, detail: `dev publish accepted (session ${id}) — maintenance clears on this boot`, hint: "no action — the deploy witness carries it to fresh browsers.", category: "api-publish", status: 200, reqId: rid, source: "local" });
                }
              } catch {}
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
            /* HIGH fix: writes take a signed-in admin connection. */
            if (!(await isAdminConn(String(url.searchParams.get("conn") || "")))) {
              try {
                if (anomaly) anomaly.observeFileDeny({ connId, ip: client, route: pathname });
                if (secLog) secLog.log({ level: "low", kind: "file-deny", ip: client, route: pathname, detail: "anonymous /__upload attempt denied (403, dev) — likely an expired tab", hint: "uploads need a signed-in admin; sustained hits escalate automatically.", category: "upload", status: 403, reqId: rid, source: "local" });
              } catch {}
              res.writeHead(403, { "cache-control": "no-store" });
              res.end("denied");
              return;
            }
            const ctype = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
            if (!ctype.startsWith("image/") && !ctype.startsWith("video/")) {
              res.writeHead(400, { "cache-control": "no-store" });
              res.end("bad filetype");
              return;
            }
            const askedUploadName = String(url.searchParams.get("name") || "file");
            if (ctype === "image/svg+xml" || /\.svgz?$/i.test(askedUploadName) || /\.html?$/i.test(askedUploadName)) {
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
                /* Belt and braces: the stored name decides the served type. */
                if (!/\.(jpg|jpeg|png|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/i.test(safe)) {
                  res.writeHead(400, { "cache-control": "no-store" });
                  res.end("bad filetype");
                  return;
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

          /* Backup restore (note 307; ported to this line in note 346 — dev
             restores used to lose every upload, showing blank photos/videos):
             same as scripts/serve.mjs — puts one embedded upload back under
             its exact stored name. */
          if (pathname === "/__restore-file" && req.method === "POST") {
            /* HIGH fix: writes take a signed-in admin connection. */
            if (!(await isAdminConn(String(url.searchParams.get("conn") || "")))) {
              try {
                if (anomaly) anomaly.observeFileDeny({ connId, ip: client, route: pathname });
                if (secLog) secLog.log({ level: "low", kind: "file-deny", ip: client, route: pathname, detail: "anonymous /__restore-file attempt denied (403, dev) — likely an expired tab", hint: "restores need a signed-in admin; sustained hits escalate automatically.", category: "upload", status: 403, reqId: rid, source: "local" });
              } catch {}
              res.writeHead(403, { "cache-control": "no-store" });
              res.end("denied");
              return;
            }
            const ctype = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
            /* Restored backups carry every upload kind the office uses (note 346). */
            if (!ctype.startsWith("image/") && !ctype.startsWith("video/") && !ctype.startsWith("audio/")) {
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
            if (ctype === "image/svg+xml" || !/\.(jpg|jpeg|png|webp|gif|avif|mp4|webm|mov|m4v|ogv|mp3|wav|ogg|oga|opus|m4a|aac|flac|mid|midi)$/i.test(asked)) {
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

          /* Delete an upload for good (note 307; ported to this line in note
             346): same as scripts/serve.mjs. */
          if (pathname === "/__delete-file" && req.method === "POST") {
            /* HIGH fix: deletes take a signed-in admin connection. */
            if (!(await isAdminConn(String(url.searchParams.get("conn") || "")))) {
              try {
                if (anomaly) anomaly.observeFileDeny({ connId, ip: client, route: pathname });
                if (secLog) secLog.log({ level: "low", kind: "file-deny", ip: client, route: pathname, detail: "anonymous /__delete-file attempt denied (403, dev) — likely an expired tab", hint: "deletes need a signed-in admin; sustained hits escalate automatically.", category: "upload", status: 403, reqId: rid, source: "local" });
              } catch {}
              res.writeHead(403, { "cache-control": "no-store" });
              res.end("denied");
              return;
            }
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

          /* Live address for the two-way sync (note 308; ported to this line
             in note 346 — without this door the live→local pull never
             answered on dev): office copies ask this door where "live" is
             (the first origin in cms-server.txt). */
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
             browser cannot read it directly). Identical to scripts/serve.mjs:
             same hosts, same UA, same 10s cap, same 3MB guard, same gzip —
             so local dev and the deployed office read YouTube the same way. */
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
                signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(10000) : undefined,
              });
              const YT_MAX_BYTES = 3 * 1024 * 1024;
              let ytBytes = 0;
              const ytParts = [];
              let ytTooBig = false;
              try {
                if (!upstream.body) throw new Error("empty");
                for await (const chunk of upstream.body) {
                  ytBytes += chunk.length;
                  if (ytBytes > YT_MAX_BYTES) {
                    ytTooBig = true;
                    try { await upstream.cancel(); } catch {}
                    break;
                  }
                  ytParts.push(chunk);
                }
              } catch {
                ytTooBig = true;
              }
              const text = ytTooBig ? "" : Buffer.concat(ytParts).toString("utf8");
              if (!upstream.ok || !text) {
                res.writeHead(502, { "cache-control": "no-store" });
                res.end(ytTooBig ? "too large" : "unreachable");
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

