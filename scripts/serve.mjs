import http from "node:http";
import { readFile, stat, mkdir, writeFile, rm } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { createCmsHost, hashText } from "./cms-local.mjs";
import { isLoopbackAddr } from "./live-follow.mjs";
import { answerWithSeedFallback, primeMirrorSeed } from "./seed-fallback.mjs";
import { createGeoProxy } from "./geo-proxy.mjs";
import { guardAtBoot } from "./backup-data.mjs";
import { MIME } from "./mime.mjs";
import { createSecurityLog } from "./security-log.mjs";
import { createWaf, getClientIp, isSafePath, endpointCategory, ipClass, normalizeIp } from "./waf.mjs";
import { createSessionAnomaly } from "./session-anomaly.mjs";
import { createPublishWatch } from "./publish-watch.mjs";
import { createHash } from "node:crypto";

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
/* Unnumbered code word (stale fix, no new number): a dist baked from older
   code can never pass silently even when the update number is unchanged. */
let SRC_CODE = "";
try {
  const srcHooks = await readFile(path.join(ROOT, "src", "lib", "hooks.ts"), "utf8");
  const cm = /export const CODE_ID = "([A-Za-z0-9_-]+)"/.exec(srcHooks);
  if (cm) SRC_CODE = cm[1];
} catch {
  /* stamp unreadable — the page stamp still shows */
}
let DIST_CODE = "";
try {
  DIST_CODE = String(JSON.parse(await readFile(path.join(DIST, "version.json"), "utf8")).code || "");
} catch {
  /* built before code words — treated as old */
}
if (SRC_NOTES) console.log(`site update ${SRC_NOTES} (the same number is in version.json)`);
if (SRC_NOTES && DIST_NOTES && DIST_NOTES < SRC_NOTES) {
  console.warn(`OLD BUILD: dist/ is update ${DIST_NOTES} but this folder is update ${SRC_NOTES} — run \`npm run build\` before \`npm start\`, or use \`npm run dev\`.`);
} else if (SRC_NOTES && !DIST_NOTES) {
  console.warn(`dist/ has no version stamp (built before update stamps) — run \`npm run build\` so dist/ matches update ${SRC_NOTES}.`);
}
if (SRC_CODE && DIST_CODE && DIST_CODE !== SRC_CODE) {
  console.warn(`OLD BUILD: dist/ carries code "${DIST_CODE}" but this folder is code "${SRC_CODE}" — run \`npm run build\` before \`npm start\`, or use \`npm run dev\`.`);
} else if (SRC_CODE && !DIST_CODE) {
  console.warn(`dist/ has no code word (built before code words) — run \`npm run build\` so dist/ matches code "${SRC_CODE}".`);
}
/* Clean-deploy flag (option A): with clean-deploy.txt beside package.json
   this deploy ships no words — Recover + Publish, then REMOVE the file and
   rebuild to lock words in. Said out loud here so a clean live site is never
   a mystery. */
try {
  await readFile(path.join(ROOT, "clean-deploy.txt"), "utf8");
  console.warn("clean-deploy.txt present — this deploy ships no words: Recover + Publish, then REMOVE the file and rebuild to lock words in.");
} catch { /* words ride as usual */ }

/* Security shield (WAF + session anomaly + real-time terminal log + PDF).
   Sits in FRONT of the entire code: every request passes checkRequest before
   any file or RPC runs. Zero deps, sync regex only — no deploy slowdown.
   Maintenance / clean-deploy / live-relay behavior is untouched: this layer
   only blocks malicious patterns, never Publish/Recover/version/seed flows. */
const secLog = createSecurityLog({ rootDir: ROOT, service: "serve" });
const waf = createWaf();
const anomaly = createSessionAnomaly({ log: (e) => secLog.log(e) });
/* First-Publish proof (the "other browsers still wait" fix): after every
   successful office publish, re-read the office stamp and ask the live box —
   logging confirmation or, if live is still behind, the exact remedy. Skips
   itself on the live box (RENDER). Zero deploy impact: runtime only. */
const publishWatch = createPublishWatch({
  getOfficeStamp: async () => {
    try {
      const r = await cms.call("contentRev", "publish-watch", "");
      if (!r || r.status !== 200) return null;
      const d = JSON.parse(r.body);
      if (!d || d.ok !== true) return null;
      return { rev: Math.floor(Number(d.rev)) || 0, notes: Math.floor(Number(d.notes)) || 0, at: Number(d.at) || 0 };
    } catch {
      return null;
    }
  },
  getLiveUrl: liveUrlFromFile,
  log: (e) => secLog.log(e),
});
// last network address seen per conn id (for RPC attribution; best effort)
const lastIpByConn = new Map();
function rpcAnomaly({ connId, rpc, ok, err }) {
  try {
    anomaly.observeRpc({ connId, ip: lastIpByConn.get(String(connId || "")) || "-", rpc, ok, err });
  } catch {}
}
function clientIp(req) {
  // Spoof-safe: forwarded headers are honored ONLY behind a trusted proxy
  // (Render's router sets RENDER; TRUST_PROXY=1 covers other hosts). Direct
  // hits use the socket address — a public client cannot smuggle XFF past
  // this. Loopback/IPv6 forms are normalized to one spelling (see waf.mjs).
  try {
    return getClientIp(req, !!process.env.RENDER || process.env.TRUST_PROXY === "1");
  } catch {
    return "-";
  }
}
// Short per-request id, logged with every security event (request identifiers).
function reqId() {
  try {
    return Math.random().toString(36).slice(2, 10);
  } catch {
    return "r0";
  }
}
// Stable per-IP number for the content server's per-NETWORK login backstop
// (cms-server.js allowAttempt keys netFails off conn.net[2]). Previously every
// conn carried 0, so 40 fails anywhere locked out logins EVERYWHERE for 10
// min; now the backstop is genuinely per IP.
function ipNetNum(ip) {
  try {
    return createHash("sha256").update("wom-net|" + normalizeIp(ip)).digest().readUInt32BE(0);
  } catch {
    return 0;
  }
}
async function liveUrlFromFile() {
  try {
    const raw = await readFile(path.join(ROOT, "cms-server.txt"), "utf8").catch(() => "");
    const first = String(raw).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))[0] || "";
    const clean = first.replace(/\/+$/, "");
    if (/^https?:\/\/[^/\s]+$/i.test(clean)) return clean;
  } catch {}
  return "";
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
  // Security shield observes every RPC (privilege/volume) — never blocks here,
  // never slows deploys; the WAF at the http layer does the blocking.
  return createCmsHost(ROOT, {
    follow: true,
    onRpc: ({ method, id, status, body }) => {
      try {
        const m = String(method || "");
        const b = typeof body === "string" ? body : "";
        let ok = status === 200 && !/"ok"\s*:\s*false/.test(b.slice(0, 4000));
        let err = "";
        const em = /"err"\s*:\s*"([^"]{1,40})"/.exec(b.slice(0, 4000));
        if (em) err = em[1];
        rpcAnomaly({ connId: id, rpc: m, ok, err });
        if (m === "publish" && ok) publishWatch.noteOfficePublish();
      } catch {
        /* observation never breaks serving */
      }
    },
  });
})();
const geoProxy = createGeoProxy();
// Production shield line: names the mode honestly (this IS the prod path —
// the dev backend logs its own dev line), plus proxy trust and evidence
// persistence, so the terminal never reads as "only dev is protected".
try {
  const persist = secLog.getPersistence();
  secLog.log({
    level: "info",
    kind: "shield-on",
    ip: "-",
    route: "-",
    detail: `WAF + session-anomaly shield active (PROD, strict, server-side — frontend edits cannot bypass) — trustProxy=${!!process.env.RENDER || process.env.TRUST_PROXY === "1" ? "on" : "off"}, evidence ${persist.persistent ? "PERSISTENT at " + persist.dir : "EPHEMERAL (" + persist.reason + ")"}`,
    hint: "watch this terminal for [SEC] lines; unique incidents auto-write data/security-report-latest.pdf; admin PDF at /__security/report.pdf",
    source: "local",
  });
} catch {
  secLog.log({ level: "info", kind: "shield-on", ip: "-", route: "-", detail: "WAF + session-anomaly shield active (PROD, strict) — malicious traffic is filtered before the server", hint: "watch this terminal for [SEC] lines; breaches auto-write data/security-report-latest.pdf; admin PDF at /__security/report.pdf", source: "local" });
}

/* HIGH fix — file-door guard: /__upload, /__restore-file and /__delete-file
   take effect only for a signed-in admin connection (the same conn id the
   tab's socket logged in with, sent as ?conn=). Anonymous browsers could
   otherwise store unlimited files on the office disk and serve them from
   this trusted origin (stored XSS via SVG/HTML, disk exhaustion, malware
   hosting). Public read — checkAdmin names no words, only whether this conn
   may write. */
async function isAdminConn(id) {
  try {
    if (!id) return false;
    const r = await cms.call("checkAdmin", id, "");
    if (!r || r.status !== 200) return false;
    const data = JSON.parse(r.body);
    return !!(data && data.ok === true && data.admin === true);
  } catch {
    return false;
  }
}

/* Wake serves the first publish (office request): after a publish the office
   mirrors the seed, so a waking box primes its fallback from the pushed
   mirror — pushed words serve within seconds instead of waiting out the
   feed-follow minute on the deploy-time bake. Best effort and silent when
   there is no feed, no network, or nothing newer to serve. */
try {
  await primeMirrorSeed(ROOT, DIST);
} catch { /* the deploy bake stands */ }

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
  setInterval(refreshRecent, 2 * 60 * 1000);
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
function sendBody(req, res, body, mime, tag, extra) {
  const etag = '"' + tag + '"';
  const baseHeaders = { "x-content-type-options": "nosniff", ...(extra || {}) };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { etag, "cache-control": "no-cache", ...baseHeaders });
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
      ...baseHeaders,
    });
    res.end(gz);
    return;
  }
  res.writeHead(200, {
    "content-type": mime,
    "content-length": buf.length,
    etag,
    "cache-control": "no-cache",
    ...baseHeaders,
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
    // Clickjacking / sniffing hardening (no behavior change for the app).
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    /* A public page (the hosted site, opened on this same computer) may probe
       and join this server over loopback: Chrome's private-network check
       needs this header on the preflight and the answer. */
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // --- WAF front door: filters malicious traffic BEFORE it reaches the server.
    // Maintenance / publish / seed / live-relay flows are allow-listed inside
    // the WAF (publish bodies carry HTML and are never signature-scanned).
    // Every check runs HERE, server-side — frontend JavaScript cannot bypass it.
    const client = clientIp(req);
    const rid = reqId();
    const connId = url.searchParams.get("conn") || "anon";
    try {
      lastIpByConn.set(String(connId || "anon"), client);
      if (lastIpByConn.size > 2000) lastIpByConn.delete(lastIpByConn.keys().next().value);
    } catch {}
    // Real per-IP login backstop (see ipNetNum): without this every conn
    // shared net 0 and 40 fails anywhere locked out logins everywhere.
    try {
      if (typeof cms.setConnNet === "function") cms.setConnNet(connId, ipNetNum(client));
    } catch {}
    const quiet = isSafePath(pathname, req.method);
    try {
      anomaly.observe({ connId, ip: client, route: pathname, method: req.method, ua: String((req.headers && req.headers["user-agent"]) || "").slice(0, 120), quiet, netClass: ipClass(client) });
    } catch {}
    try {
      const verdict = waf.checkRequest({ method: req.method, pathname, search: url.search || "", headers: req.headers, ip: client });
      if (!verdict.allow) {
        // Throttle-window repeats are the SAME incident, not new breaches:
        // info level, `rate-throttle` kind, never PDF-triggering. Fresh trips
        // keep their bucket severity. Rate trips answer 429 (+Retry-After);
        // signature blocks answer 403.
        const cont = !!verdict.continuation;
        const status = Number(verdict.status) || (cont ? 429 : 403);
        secLog.log({
          level: cont ? "info" : verdict.severity || "high",
          kind: cont ? "rate-throttle" : verdict.bucket && verdict.bucket !== "api" && status === 429 ? "rate-limit" : status === 429 ? "rate-limit" : "waf-block",
          ip: client,
          route: pathname,
          detail: verdict.reason,
          hint: verdict.hint,
          category: verdict.category || endpointCategory(pathname, req.method),
          status,
          reqId: rid,
          source: "local",
        });
        const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
        if (verdict.retryAfter) headers["retry-after"] = String(verdict.retryAfter);
        res.writeHead(status, headers);
        res.end(JSON.stringify({ ok: false, err: status === 429 ? "rate-limited" : "forbidden" }));
        return;
      }
    } catch {
      /* fail-open: a WAF error never blocks serving */
    }

    // --- Security evidence doors (signed-in admin only). The check runs HERE,
    // server-side, against the live session table (isAdminConn -> checkAdmin ->
    // sessionLive): no frontend edit, forged cookie, or query-string trick can
    // open them — an unknown/expired conn reads signed-out, full stop.
    if (pathname === "/__security/events.json" && req.method === "GET") {
      if (!(await isAdminConn(String(url.searchParams.get("conn") || "")))) {
        try {
          anomaly.observeFileDeny({ connId, ip: client, route: pathname });
        } catch {}
        secLog.log({ level: "low", kind: "file-deny", ip: client, route: pathname, detail: "unauthenticated /__security/events.json attempt denied (403)", hint: "one-offs are mistyped links; repeats escalate automatically.", category: "security", status: 403, reqId: rid, source: "local" });
        res.writeHead(403, { "cache-control": "no-store" });
        res.end("denied");
        return;
      }
      const body = JSON.stringify({ ok: true, events: secLog.getEvents(200), incidents: secLog.getIncidents(100) });
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
      res.end(body);
      return;
    }
    if (pathname === "/__security/report.pdf" && req.method === "GET") {
      if (!(await isAdminConn(String(url.searchParams.get("conn") || "")))) {
        try {
          anomaly.observeFileDeny({ connId, ip: client, route: pathname });
        } catch {}
        secLog.log({ level: "low", kind: "file-deny", ip: client, route: pathname, detail: "unauthenticated /__security/report.pdf attempt denied (403)", hint: "report PDFs need a signed-in admin conn (?conn=). One-offs are mistyped links; repeats escalate automatically.", category: "security", status: 403, reqId: rid, source: "local" });
        res.writeHead(403, { "cache-control": "no-store" });
        res.end("denied");
        return;
      }
      const events = secLog.getEvents(1000).reverse();
      const pdf = secLog.buildPdf();
      secLog.log({ level: "info", kind: "pdf-download", ip: client, route: pathname, detail: `admin downloaded security PDF (${events.length} events)`, category: "security", status: 200, reqId: rid, source: "local" });
      res.writeHead(200, { "content-type": "application/pdf", "content-length": pdf.length, "cache-control": "no-store", "content-disposition": 'attachment; filename="security-report.pdf"' });
      res.end(pdf);
      return;
    }

    if (pathname === "/scripts/local-shim.js" && req.method === "GET") {
      const shim = await readFile(path.join(ROOT, "scripts", "local-shim.js"), "utf8");
      const body = shim.split("__SITE_VERSION__").join(SITE_VERSION);
      sendBody(req, res, body, "text/javascript; charset=utf-8", "shim-" + hashText(body));
      return;
    }


    /* Live address for the two-way sync (note 308; ported to this line in
       note 346 — without this door the live→local pull never answered here):
       office copies ask this door where "live" is (the first origin in
       cms-server.txt). The live box itself (RENDER=true) answers empty — it
       IS live, so its tabs never pull. Absent file, or a blank one, the
       default live address answers instead (note 344). */
    if (pathname === "/__live-url" && req.method === "GET") {
      let live = "";
      if (!process.env.RENDER) {
        try {
          const raw = await readFile(path.join(ROOT, "cms-server.txt"), "utf8").catch(() => "");
          const first = String(raw).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))[0] || "";
          const clean = first.replace(/\/+$/, "");
          if (/^https?:\/\/[^/\s]+$/i.test(clean)) live = clean;
        } catch { /* standalone — the default answers */ }
      }
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
      /* HIGH fix: writes take a signed-in admin connection — see isAdminConn. */
      if (!(await isAdminConn(String(url.searchParams.get("conn") || "")))) {
        try {
          anomaly.observeFileDeny({ connId, ip: client, route: pathname });
        } catch {}
        secLog.log({ level: "low", kind: "file-deny", ip: client, route: pathname, detail: "anonymous /__upload attempt denied (403) — likely an expired tab", hint: "uploads need a signed-in admin; sustained hits escalate automatically.", category: "upload", status: 403, reqId: rid, source: "local" });
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
      /* Stored SVG/HTML runs script from this trusted origin — refuse it no
         matter what type the uploader claims (the stored name picks the
         served content type, not the claimed one). */
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
          /* Belt and braces: the stored name decides the served type, so only
             real media extensions may land, whatever was claimed above. */
          if (!/\.(jpg|jpeg|png|webp|gif|avif|mp4|webm|mov|m4v|ogv)$/i.test(safe)) {
            res.writeHead(400, { "cache-control": "no-store" });
            res.end("bad filetype");
            return;
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
      /* HIGH fix: writes take a signed-in admin connection — see isAdminConn. */
      if (!(await isAdminConn(String(url.searchParams.get("conn") || "")))) {
        try {
          anomaly.observeFileDeny({ connId, ip: client, route: pathname });
        } catch {}
        secLog.log({ level: "low", kind: "file-deny", ip: client, route: pathname, detail: "anonymous /__restore-file attempt denied (403) — likely an expired tab", hint: "restores need a signed-in admin; sustained hits escalate automatically.", category: "upload", status: 403, reqId: rid, source: "local" });
        res.writeHead(403, { "cache-control": "no-store" });
        res.end("denied");
        return;
      }
      const ctype = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      /* Restored backups carry every upload kind the office uses (note 346):
         photos, videos and audio — a refused kind used to come back blank. */
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
      /* The stored name decides the served type: only real media extensions
         may be written back, so a tampered backup can never plant a script
         document on this origin. */
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

    /* Delete an upload for good: it leaves data/uploads/ and stops riding in
       backups afterwards. Same naming guard as the other file endpoints. */
    if (pathname === "/__delete-file" && req.method === "POST") {
      /* HIGH fix: deletes take a signed-in admin connection — see isAdminConn. */
      if (!(await isAdminConn(String(url.searchParams.get("conn") || "")))) {
        try {
          anomaly.observeFileDeny({ connId, ip: client, route: pathname });
        } catch {}
        secLog.log({ level: "low", kind: "file-deny", ip: client, route: pathname, detail: "anonymous /__delete-file attempt denied (403) — likely an expired tab", hint: "deletes need a signed-in admin; sustained hits escalate automatically.", category: "upload", status: 403, reqId: rid, source: "local" });
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

    const rpcMatch = pathname.match(/^\/__cms\/([A-Za-z0-9_]+)$/);    if (rpcMatch && req.method === "POST") {
      const id = url.searchParams.get("conn") || "anon";
      try {
        lastIpByConn.set(String(id || "anon"), client);
      } catch {}
      try {
        if (typeof cms.setConnNet === "function") cms.setConnNet(id, ipNetNum(client));
      } catch {}
      /* Live-follow adoption (note 344) opens to this machine only — the
         per-boot token is the real lock; this is the second one. */
      if (rpcMatch[1] === "adoptLive" && !isLoopbackAddr(req.socket && req.socket.remoteAddress)) {
        secLog.log({ level: "high", kind: "privilege-escalation", ip: client, route: pathname, detail: "non-loopback adoptLive rejected", hint: "adoptLive is loopback + per-boot token only — a remote hit is forged. Restarting the backend rotates the token.", category: "api-publish", status: 403, reqId: rid, source: "local" });
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
        // Context WAF on the RPC body (publish-family skipped inside checkBody).
        try {
          const bv = waf.checkBody({ rpc: rpcMatch[1], body, ip: client });
          if (!bv.allow) {
            const cont = !!bv.continuation;
            const status = Number(bv.status) || (cont ? 429 : 403);
            secLog.log({ level: cont ? "info" : bv.severity || "high", kind: cont ? "rate-throttle" : status === 429 ? "rate-limit" : "waf-block", ip: client, route: pathname, detail: bv.reason, hint: bv.hint, category: bv.category || "api", status, reqId: rid, source: "local" });
            const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
            if (bv.retryAfter) headers["retry-after"] = String(bv.retryAfter);
            res.writeHead(status, headers);
            res.end(JSON.stringify({ ok: false, err: status === 429 ? "rate-limited" : "forbidden" }));
            return;
          }
        } catch {
          /* fail-open */
        }
        const r = await cms.call(rpcMatch[1], id, body);
        // Terminal narrative for auth + publish (the office's two key moments).
        try {
          const preview = typeof r.body === "string" ? r.body.slice(0, 2000) : "";
          const denied = /"ok"\s*:\s*false/.test(preview);
          if ((rpcMatch[1] === "login" || rpcMatch[1] === "login2fa") && denied) {
            secLog.log({ level: "low", kind: "auth-fail", ip: client, route: pathname, detail: `${rpcMatch[1]} denied (session ${id})`, hint: "a wrong password/2FA code — a few is the office mistyping; a burst escalates via auth-probing (already rate-limited). Confirm 2FA is on.", category: "api-auth", status: 200, reqId: rid, source: "local" });
          } else if (rpcMatch[1] === "publish" && !denied) {
            secLog.log({ level: "info", kind: "publish", ip: client, route: pathname, detail: `publish accepted (session ${id}) — maintenance clears on this deploy`, hint: "no action — visitors lift via storage/broadcast; the deploy witness carries it to fresh browsers.", category: "api-publish", status: 200, reqId: rid, source: "local" });
          }
        } catch {}
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
        "x-content-type-options": "nosniff",
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
        "x-content-type-options": "nosniff",
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
        "x-content-type-options": "nosniff",
      });
      res.end(body);
      return;
    }
    /* Uploads are office files, not app code: sandbox them so even a stored
       document type can never run script on this origin. */
    const uploadExtra = rel.startsWith("data/uploads/") ? { "content-security-policy": "sandbox" } : undefined;
    sendBody(req, res, body, mime, st.size + "-" + Math.round(st.mtimeMs), uploadExtra);
  } catch {
    res.writeHead(500);
    res.end("server error");
  }
});

server.listen(PORT, () => {
  /* Cold-start marker (note 344): on hosts that sleep (Render free), every
     wake prints here with the time — the office can see in the host log when
     the box last slept, and the bake below keeps serving the last publish
     whole from the first second. */
  console.log(`cold start at ${new Date().toISOString()} — serving baked words (update ${SRC_NOTES || DIST_NOTES || "?"})`);
  console.log(`Site + admin backend at http://localhost:${PORT}/  (admin: /admin) — production build, update ${SRC_NOTES || DIST_NOTES || "?"}`);
  // Live online/offline narrative in this terminal (best effort; standalone skips).
  try {
    secLog.startLiveWatch({ getLiveUrl: liveUrlFromFile, intervalMs: 60000 });
  } catch {}
});
