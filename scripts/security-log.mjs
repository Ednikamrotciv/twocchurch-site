/* scripts/security-log.mjs — the real-time security log, terminal-only.
   - `npm run dev` terminal shows EVERYTHING: each WAF block + anomaly event with
     severity, IP and a hint on what to do, tagged [local] or [live], plus whether
     the live deploy is reachable (online) or not (offline).
   - Every potential breach (medium+) also writes a breach-report PDF under logs/
     and prints a clickable terminal link (file path + this-machine-only URL).
     Nothing is shown in the admin console.
   - Persists to logs/security-events.jsonl (git-ignored via the logs/ rule).
   - Serves GET /__security-status (counts + recent; IPs masked for anonymous
     callers, full for signed-in admins) so the live-watch can poll it, plus the
     breach PDFs (conn-gated full report, loopback-only local snapshot).
   - Follows the live deploy like live-follow does (polls its /__security-status,
     merges with a [live] tag) — best-effort, never throws, never blocks content.
     When the live box is unreachable it logs "offline — showing local only".

   Wiring (both servers): createSecurityLog() once per boot; pass its
   .logEvent into createWaf({onEvent}) + createAnomalyTracker({onEvent});
   mount .handleStatus/.handleReport/.handleLocalReport/.handleBeacon;
   call .startLiveWatch() for serving processes only (never bakes/builds).
*/

import { appendFile, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { breachEvents, buildBreachPdf, reportFilename } from "./security-report.mjs";

const SEV_ORDER = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

function nowTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function maskIp(ip) {
  const s = String(ip || "unknown");
  if (s === "unknown" || !s) return "unknown";
  if (s.includes(".")) { const q = s.split("."); return q.length === 4 ? `${q[0]}.${q[1]}.${q[2]}.*` : s; }
  if (s.includes(":")) { const q = s.split(":"); return q.slice(0, 3).join(":") + ":*"; }
  return s.slice(0, 4) + "*";
}

export function createSecurityLog({ rootDir, service = "serve", console = true, localBase } = {}) {
  const ROOT = rootDir || process.cwd();
  const ring = []; // last 500 events
  const counts = { info: 0, low: 0, medium: 0, high: 0, critical: 0, blocked: 0 };
  let online = null; // null = unknown yet, true/false after first live check
  let liveOrigin = "";
  let liveCounts = null;
  let liveRecent = [];
  let liveReachable = false;
  /* Breach-PDF snapshots (terminal link): latest written file + throttle state.
     A snapshot is written shortly after each NEW potential breach (medium+) so
     the terminal can print a clickable link to it. */
  let lastPdfPath = "";
  let lastBreachKey = "";
  let lastPdfAt = 0;
  let snapshotTimer = null;
  const LOCAL_BASE = localBase || `http://localhost:${Number(process.env.PORT || 5173)}`;

  async function persist(ev) {
    try {
      const dir = path.join(ROOT, "logs");
      await mkdir(dir, { recursive: true });
      await appendFile(path.join(dir, "security-events.jsonl"), JSON.stringify(ev) + "\n", "utf8");
    } catch { /* logging never breaks serving */ }
  }

  function pretty(ev) {
    const tag = ev.origin === "live" ? "[live]" : "[local]";
    const net = ev.online === true ? "online" : ev.online === false ? "offline" : "local";
    const sev = String(ev.severity || "info").toUpperCase().padEnd(8);
    const src = String(ev.source || "?");
    const rule = ev.rule ? ` ${ev.rule}` : ev.kind ? ` ${ev.kind}` : "";
    const ip = ev.ip ? ` ip=${ev.ip}` : "";
    const msg = ev.msg || ev.detail || "";
    const hint = ev.hint ? ` → ${ev.hint}` : "";
    return `[security] ${ev.time} ${tag} ${net} ${sev} ${src}${rule}${ip} ${msg}${hint}`;
  }

  /* Merged breach list for PDFs: local ring + mirrored live highs, oldest
     first, de-duplicated. */
  function mergedBreaches() {
    const local = breachEvents(ring);
    const live = breachEvents(liveRecent).map((e) => ({ ...e, origin: "live" }));
    const seen = new Set(local.map((e) => `${e.at}|${e.rule || e.kind}|${e.ip}`));
    const merged = [...local, ...live.filter((e) => !seen.has(`${e.at}|${e.rule || e.kind}|${e.ip}`))];
    merged.sort((a, b) => (a.at || 0) - (b.at || 0));
    return merged;
  }

  function breachKey(list) {
    const l = list[list.length - 1];
    return l ? `${l.at}|${l.rule || l.kind}|${l.ip}|${list.length}` : "";
  }

  /* Write a timestamped breach-report PDF under logs/ plus a stable
     logs/security-breach-report-latest.pdf copy, prune to the newest 20, and
     print a clickable terminal link (file path + this-machine-only URL). */
  async function writeSnapshot() {
    try {
      const list = mergedBreaches();
      if (!list.length) return;
      const key = breachKey(list);
      if (key === lastBreachKey && Date.now() - lastPdfAt < 5 * 60 * 1000) return;
      const pdf = buildBreachPdf(list, { service, online: online === true, counts });
      const dir = path.join(ROOT, "logs");
      await mkdir(dir, { recursive: true });
      const name = reportFilename();
      const rel = `logs/${name}`;
      await writeFile(path.join(dir, name), Buffer.from(pdf));
      try { await writeFile(path.join(dir, "security-breach-report-latest.pdf"), Buffer.from(pdf)); } catch {}
      lastBreachKey = key;
      lastPdfAt = Date.now();
      lastPdfPath = path.join(dir, name);
      try {
        const files = (await readdir(dir)).filter((f) => /^security-breach-report-\d{8}-\d{4}\.pdf$/.test(f)).sort();
        while (files.length > 20) {
          const old = files.shift();
          try { await unlink(path.join(dir, old)); } catch {}
        }
      } catch { /* pruning never breaks logging */ }
      if (console) {
        console.log(`[security] breach PDF: ${rel} (${list.length} potential ${list.length === 1 ? "breach" : "breaches"}) — Ctrl+click to open, or ${LOCAL_BASE}/__security-report-local.pdf`);
      }
    } catch { /* snapshots never break serving */ }
  }

  function scheduleSnapshot() {
    if (snapshotTimer) return;
    snapshotTimer = setTimeout(() => { snapshotTimer = null; writeSnapshot(); }, 2500);
  }

  function logEvent(raw) {
    try {
      const ev = {
        at: Date.now(),
        time: nowTime(),
        service,
        origin: raw.origin || "local",
        online: typeof raw.online === "boolean" ? raw.online : online === true,
        source: raw.source || "server",
        severity: SEV_ORDER[raw.severity] != null ? raw.severity : "info",
        rule: raw.rule || "",
        kind: raw.kind || "",
        msg: raw.msg || raw.detail || "",
        detail: raw.detail || raw.msg || "",
        ip: raw.ip || "unknown",
        conn: raw.connId ? String(raw.connId).slice(0, 24) : "",
        hint: raw.hint || "",
      };
      ring.push(ev);
      if (ring.length > 500) ring.shift();
      if (counts[ev.severity] != null) counts[ev.severity]++;
      if (raw.source === "waf" && raw.msg !== "elevated request rate") counts.blocked++;
      persist(ev);
      if (console) {
        const line = pretty(ev);
        if (ev.severity === "critical" || ev.severity === "high") console.warn(line);
        else console.log(line);
      }
      /* Any potential breach (medium+) queues a PDF snapshot so the terminal
         prints a clickable link to it a moment later. */
      if (SEV_ORDER[ev.severity] >= SEV_ORDER.medium) scheduleSnapshot();
      return ev;
    } catch { return null; }
  }

  function info(msg, extra = {}) { return logEvent({ severity: "info", msg, ...extra }); }

  function statusFor({ admin }) {
    const recent = ring.slice(-20).reverse().map((e) => (admin ? e : { ...e, ip: maskIp(e.ip), conn: "" }));
    return {
      ok: true, service, mode: "enforce",
      online: online === true, liveOrigin: liveOrigin || undefined,
      liveReachable, liveCounts, liveRecent: admin ? liveRecent : [],
      counts: { ...counts }, recent,
    };
  }

  async function handleStatus(_req, res, { admin }) {
    const body = JSON.stringify(statusFor({ admin }));
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
  }

  /* Breach-report PDF (admin only): every potential breach (medium+) in this
     boot's ring, oldest first, plus any mirrored live ones — with severity, IP
     and the hint on what to do. The Admin console offers the same file with one
     click whenever a breach exists. */
  async function handleReport(_req, res, { admin }) {
    if (!admin) {
      res.writeHead(403, { "cache-control": "no-store" });
      res.end("denied");
      return;
    }
    try {
      const local = breachEvents(ring);
      const live = breachEvents(liveRecent).map((e) => ({ ...e, origin: "live" }));
      const seen = new Set(local.map((e) => `${e.at}|${e.rule || e.kind}|${e.ip}`));
      const merged = [...local, ...live.filter((e) => !seen.has(`${e.at}|${e.rule || e.kind}|${e.ip}`))];
      merged.sort((a, b) => (a.at || 0) - (b.at || 0));
      const pdf = buildBreachPdf(merged, { service, online: online === true, counts });
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": pdf.length,
        "content-disposition": `attachment; filename="${reportFilename()}"`,
        "cache-control": "no-store",
      });
      res.end(Buffer.from(pdf));
    } catch {
      res.writeHead(500, { "cache-control": "no-store" });
      res.end("report failed");
    }
  }

  /* This-machine-only PDF (loopback-gated, no admin conn needed): backs the
     clickable terminal link. Serves a fresh PDF from the current ring when
     breaches exist, else the latest snapshot file, else 404 ("quiet"). Safe to
     expose because only this machine can fetch it — LAN strangers get 403. */
  async function handleLocalReport(_req, res, { loopback }) {
    if (!loopback) {
      res.writeHead(403, { "cache-control": "no-store" });
      res.end("denied");
      return;
    }
    try {
      const list = mergedBreaches();
      if (list.length) {
        const pdf = buildBreachPdf(list, { service, online: online === true, counts });
        res.writeHead(200, {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${reportFilename()}"`,
          "cache-control": "no-store",
        });
        res.end(Buffer.from(pdf));
        return;
      }
      if (lastPdfPath) {
        try {
          const data = await readFile(lastPdfPath);
          res.writeHead(200, {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="${reportFilename()}"`,
            "cache-control": "no-store",
          });
          res.end(data);
          return;
        } catch { /* fall through to quiet */ }
      }
      res.writeHead(404, { "cache-control": "no-store" });
      res.end("no potential breaches recorded");
    } catch {
      res.writeHead(500, { "cache-control": "no-store" });
      res.end("report failed");
    }
  }

  /* Static-guard beacon (no server needed on static hosts): records the
     neutralised URL pattern as a low event. Unsigned, tiny, rate-limited by IP
     in the caller — here we just log it. */
  async function handleBeacon(req, res, { ip }) {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on("end", () => {
      logEvent({ source: "waf-static", severity: "low", rule: "WAF-STATIC", msg: "static guard neutralised a malicious URL", detail: String(body).slice(0, 300), ip, hint: "Static-host copy filtered a bad URL in the browser. No action needed unless one IP does this repeatedly — then block it." });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  /* Live watch: poll the live deploy's /__security-status and mirror its worst
     into THIS terminal, so `npm run dev` tells everything in the live deploy.
     Same spirit as live-follow: best-effort, serving processes only. */
  let watchStarted = false;
  function startLiveWatch({ getLiveOrigin, intervalMs = 20000 } = {}) {
    if (watchStarted) return;
    watchStarted = true;
    if (process.env.RENDER) { info("live watch off on the live box itself (it IS live)"); return; }
    if (typeof fetch !== "function") { info("live watch off (no fetch in this Node)"); return; }
    let running = false;
    const round = async () => {
      if (running) return;
      running = true;
      try {
        let origin = "";
        try { origin = await getLiveOrigin(); } catch { origin = ""; }
        if (!origin) { if (online !== false && online !== null) { online = false; info("live deploy address unknown — offline, monitoring local only"); } else online = false; return; }
        liveOrigin = origin;
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : 0;
        let res = null;
        try {
          const r = await fetch(origin + "/__security-status", { cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
          if (r.ok) res = await r.json().catch(() => null);
        } catch { res = null; } finally { if (timer) clearTimeout(timer); }
        if (!res || res.ok !== true) {
          if (online !== false) { online = false; liveReachable = false; info(`live deploy unreachable (${origin}) — offline, monitoring local only`); }
          return;
        }
        const was = online;
        online = true; liveReachable = true;
        liveCounts = res.counts || null;
        liveRecent = Array.isArray(res.recent) ? res.recent.slice(0, 5) : [];
        if (was !== true) info(`live deploy reachable (${origin}) — online, mirroring its security feed`);
        // Mirror anything new and serious straight into this terminal.
        const worst = (liveRecent || []).filter((e) => e && (e.severity === "high" || e.severity === "critical"))[0];
        const key = worst ? [worst.at, worst.rule || worst.kind, worst.ip].join("|") : "";
        if (worst && key !== round._lastKey) {
          round._lastKey = key;
          logEvent({ origin: "live", online: true, source: worst.source || "live", severity: worst.severity, rule: worst.rule, kind: worst.kind, msg: worst.msg || worst.detail, detail: worst.detail, ip: worst.ip, hint: worst.hint });
        }
      } finally { running = false; }
    };
    setTimeout(() => round().catch(() => {}), 4000);
    setInterval(() => round().catch(() => {}), intervalMs);
  }

  function bootLine({ deployId, cleanDeploy }) {
    info(`security on — WAF in front of all doors (mode enforce) + anomaly watch (travel/volume/privilege)${deployId ? ` · deploy ${deployId}` : ""}${cleanDeploy ? " · clean deploy (no words until Recover + Publish)" : ""}`, { severity: "info" });
    info("maintenance hold intact — new deploys wait on the notice until admin Publish clears it; publish path allow-listed, never blocked", { severity: "info" });
    info(`breach PDFs: every potential breach writes logs/<report>.pdf with a clickable terminal link + ${LOCAL_BASE}/__security-report-local.pdf (this machine only)`, { severity: "info" });
  }

  return { logEvent, info, statusFor, handleStatus, handleReport, handleLocalReport, startLiveWatch, bootLine, get online() { return online; } };
}
