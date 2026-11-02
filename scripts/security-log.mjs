// security-log.mjs — real-time security event log for `npm run dev` and `npm start`.
// Zero dependencies (keeps frontend/backend deploys fast). Best-effort: never throws.
//
// What it does:
// - Every security-relevant event is printed to the terminal immediately,
//   with severity, IP address, route, and a hint on what to do. Terminal output
//   is sanitized (no newlines/control chars from request data), so logged
//   request paths cannot inject fake lines or escape sequences (log injection).
// - Events are appended to data/security-events.jsonl (or $SECURITY_LOG_DIR),
//   with size-based rotation so the file cannot grow without bound.
// - Repeats from the same source+endpoint inside one window are AGGREGATED
//   into a single incident: the first hit logs at its severity, continuations
//   log at info as `rate-throttle`/duplicates and never trigger a new PDF.
//   Reports therefore count UNIQUE incidents, not raw requests.
// - A fresh medium+ incident (not a duplicate) writes a PDF report to
//   data/security-report-latest.pdf (plus a timestamped copy).
// - Classification (stored on every event as `class`):
//     blocked-request    — one signature deny (traversal, SQLi, XSS, ...).
//                          A block is NOT a breach by itself.
//     rate-limit         — a throttle-window trip (429). Policy event, not an
//                          attack verdict; routine polling must never read as
//                          "20 breaches".
//     suspicious-pattern — anomaly watch (volume, UA churn, offline) to review.
//     security-incident  — needs a human: privilege escalation, auth probing
//                          bursts, command-injection, stuck publishes.
//     notice             — operational info (shield-on, publish accepted,
//                          live-online, PDF written). Never a breach.
//   A *confirmed compromise* (an actual breach, not a blocked attempt) is NEVER
//   auto-declared: nothing in this file can know one happened. Only a human
//   reviewing a security-incident may escalate it.
// - startLiveWatch() polls the live deploy's /version.json and logs
//   online/offline transitions, so the local terminal narrates the live box too.
// - Persistence: on a laptop the log dir is the local disk (persistent). On
//   Render the local disk is EPHEMERAL unless a persistent disk is mounted:
//   getPersistence() reports this honestly and the boot line says what to do.
import { appendFile, mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const LEVELS = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const COLORS = {
  info: "\x1b[90m",
  low: "\x1b[32m",
  medium: "\x1b[33m",
  high: "\x1b[31m",
  critical: "\x1b[41m\x1b[37m",
};
const RESET = "\x1b[0m";

// Incident aggregation: repeats from the same source+endpoint inside this
// window extend the SAME incident instead of minting new "breaches".
const INCIDENT_WINDOW_MS = 10 * 60 * 1000;
const AGG_KINDS = new Set([
  "waf-block",
  "rate-limit",
  "rate-throttle",
  "auth-fail",
  "auth-probing",
  "privilege-escalation",
  "file-deny",
  "unusual-volume",
  "live-offline",
  "publish-stuck",
]);

const MAX_JSONL_BYTES = 5 * 1024 * 1024;

function ascii(s) {
  return String(s || "").replace(/[^\x20-\x7e]/g, "?");
}

// Single-line, terminal-safe field (log-injection guard).
function clean(s, max) {
  return ascii(s).replace(/[\r\n]+/g, "?").slice(0, max);
}

function pdfEscape(s) {
  return ascii(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").slice(0, 220);
}

// Every event gets a class. A blocked request or a throttle is NOT a breach.
export function classifyEvent(e) {
  const kind = String((e && e.kind) || "");
  const level = String((e && e.level) || "info");
  const detail = String((e && e.detail) || "");
  if (kind === "rate-throttle") return "rate-limit";
  if (kind === "rate-limit") return "rate-limit";
  if (kind === "waf-block") {
    if (/throttl|rate .*exceed|retry in/i.test(detail)) return "rate-limit";
    return "blocked-request";
  }
  if (kind === "auth-fail" || kind === "ua-churn" || kind === "live-online" || kind === "live-offline") {
    return kind === "auth-fail" ? "suspicious-pattern" : "notice";
  }
  if (kind === "unusual-volume" || kind === "auth-probing" || kind === "session-hopping") return "suspicious-pattern";
  if (kind === "privilege-escalation" || kind === "publish-stuck") return "security-incident";
  if (level === "critical") return "security-incident";
  if (level === "high") return kind === "impossible-travel" || kind === "live-offline" ? "suspicious-pattern" : "security-incident";
  return "notice";
}

export function aggregateKey(e) {
  return [String(e.kind || ""), String(e.ip || ""), String(e.route || "")].join("|");
}

// Minimal multi-page PDF writer (Helvetica only, no deps).
// statusRows (optional, 4th arg) prepends the 7-area posture board:
// RED ALERT lines render in red, WARNING in dark orange, the rest in black.
// Old 3-arg callers keep working — the board is simply skipped when absent.
export function buildPdfBuffer(allEvents, breachCount, incidents, statusRows = null) {
  const events = Array.isArray(allEvents) ? allEvents.slice(-300) : [];
  const list = Array.isArray(incidents) ? incidents.slice(-120) : null;
  const generated = new Date().toISOString();
  const title = "Security report — World Overcomers website";
  const sub = list
    ? `Generated ${generated}  |  unique incidents: ${list.length}  |  raw events: ${events.length}`
    : `Generated ${generated}  |  potential breaches: ${breachCount}  |  events shown: ${events.length}`;
  const lines = [];
  const colors = []; // parallel to lines: "" | "red" | "warn"
  function push(ln, color = "") {
    lines.push(ln);
    colors.push(color);
  }
  function colorForHead(head) {
    const h = String(head || "");
    if (/\[RED ALERT\]|\[CRITICAL\]|\[HIGH\]|\(security-incident\)/.test(h)) return "red";
    if (/\[WARNING\]|\[MEDIUM\]/.test(h)) return "warn";
    return "";
  }
  push(title);
  push(sub);
  push("Counts are UNIQUE incidents (repeats from one source+endpoint inside 10 min count once).");
  push("A blocked request or a throttle is not a breach — only reviewed security-incidents may escalate.");
  push("");
  if (Array.isArray(statusRows) && statusRows.length) {
    push("SECURITY POSTURE — 7 AREAS (most serious = RED ALERT; operational gaps = WARNING/NOTICE, never red)");
    for (const r of statusRows) {
      const tag = r.status === "RED ALERT" ? "[RED ALERT]" : `[${String(r.status || "notice").toUpperCase()}]`;
      const head = `${tag} ${r.area} — ${String(r.detail || "").slice(0, 220)}`;
      push(head, r.status === "RED ALERT" ? "red" : r.status === "WARNING" ? "warn" : "");
      if (r.hint) push(`  hint: ${String(r.hint).slice(0, 220)}`);
    }
    push("");
  }
  if (list && list.length) {
    for (const inc of list) {
      const head = `[${inc.lastTs || inc.firstTs || "?"}][${String(inc.maxLevel || "info").toUpperCase()}][${inc.ip || "-"}][${inc.route || "-"}] ${inc.kind || "event"} x${inc.count || 1} (${inc.class || "notice"})`;
      push(head, colorForHead(head));
      if (inc.sample) push(`  sample: ${inc.sample}`);
      if (inc.hint) push(`  hint: ${inc.hint}`);
      if (inc.firstTs && inc.lastTs && inc.lastTs !== inc.firstTs) push(`  window: ${inc.firstTs} .. ${inc.lastTs}`);
      push("");
    }
  } else if (!events.length && !(Array.isArray(statusRows) && statusRows.length)) {
    push("No security events recorded yet.");
    push("The WAF and session-anomaly detector log here in real time.");
  } else if (!events.length) {
    push("No security events recorded yet — board above reflects live checks, not the log.");
  } else {
    for (const e of events) {
      const head = `[${e.ts || "?"}][${String(e.level || "info").toUpperCase()}][${e.ip || "-"}][${e.route || "-"}] ${e.kind || "event"}${e.class ? " (" + e.class + ")" : ""}${e.dup ? " [repeat]" : ""}`;
      push(head, colorForHead(head));
      if (e.detail) push(`  detail: ${e.detail}`);
      if (e.hint) push(`  hint: ${e.hint}`);
      if (e.source) push(`  source: ${e.source}${e.online != null ? (e.online ? " (online)" : " (offline)") : ""}`);
      push("");
    }
  }
  // paginate: ~48 lines per A4 page at 9pt (colors ride alongside lines)
  const PER_PAGE = 48;
  const pages = [];
  const pageColors = [];
  for (let i = 0; i < lines.length; i += PER_PAGE) {
    pages.push(lines.slice(i, i + PER_PAGE));
    pageColors.push(colors.slice(i, i + PER_PAGE));
  }
  if (!pages.length) {
    pages.push(["No events."]);
    pageColors.push([""]);
  }
  const objects = [];
  // object numbering: 1 catalog, 2 pages, 3 font, then per page: page obj + content obj
  const pageObjs = [];
  let n = 4;
  for (const _ of pages) {
    pageObjs.push({ page: n, content: n + 1 });
    n += 2;
  }
  const fontObj = 3;
  function textStream(pageLines, colorsForPage) {
    // Per-line color: RED ALERT / critical / high in red, WARNING / medium in
    // dark orange, everything else black. One BT/ET block per line so the
    // color operator applies exactly to that line.
    let s = "";
    pageLines.forEach((ln, i) => {
      const c = (colorsForPage && colorsForPage[i]) || "";
      const col = c === "red" ? "1 0 0 rg" : c === "warn" ? "0.6 0.35 0 rg" : "0 0 0 rg";
      const y = 800 - i * 11;
      s += `BT /F1 9 Tf ${col} 40 ${y} Td (${pdfEscape(ln)}) Tj ET\n`;
    });
    return s;
  }
  const pageRefs = pageObjs.map((p) => `${p.page} 0 R`).join(" ");
  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>\nendobj\n`;
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  pages.forEach((pl, i) => {
    const { page, content } = pageObjs[i];
    objects[page] = `${page} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${content} 0 R >>\nendobj\n`;
    const stream = textStream(pl, pageColors[i]);
    objects[content] = `${content} 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`;
  });
  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < n; i++) {
    offsets[i] = Buffer.byteLength(out);
    out += objects[i] || "";
  }
  const xrefAt = Buffer.byteLength(out);
  out += `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) {
    out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  out += `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

export function createSecurityLog({ rootDir, service = "site" } = {}) {
  const base = rootDir || process.cwd();
  // $SECURITY_LOG_DIR lets Render mount a persistent disk just for evidence
  // without moving the content store. Default stays data/ beside the code.
  const dir = process.env.SECURITY_LOG_DIR || path.join(base, "data");
  const jsonl = path.join(dir, "security-events.jsonl");
  const events = [];
  const incidents = new Map(); // aggregateKey -> incident record
  let liveOnline = null;
  let pdfTimer = null;
  let pendingPdf = false;
  let approxBytes = 0;
  try {
    stat(jsonl).then((s) => {
      approxBytes = Number(s.size) || 0;
    }).catch(() => {});
  } catch {}

  const onRender = !!process.env.RENDER;
  // Honest persistence answer: laptop disks persist; Render's local disk does
  // NOT unless the operator mounted one (DATA_DIR set or explicit opt-in).
  const persistent = !onRender || !!(process.env.DATA_DIR || process.env.SECURITY_PERSISTENT === "1" || process.env.SECURITY_LOG_DIR);

  function getPersistence() {
    return {
      dir,
      file: jsonl,
      approxBytes,
      persistent,
      reason: persistent
        ? onRender
          ? "Render with SECURITY_LOG_DIR/DATA_DIR set — evidence rides the mounted disk"
          : "local disk — evidence survives restarts"
        : "Render WITHOUT a mounted disk — data/security-events.jsonl and the PDF are EPHEMERAL (sleep/restart wipes them). Mount a disk at data/ (or set SECURITY_LOG_DIR to a mounted path) to keep evidence; the admin JSON/PDF doors still serve the live in-memory log.",
    };
  }

  function print(e) {
    // Sanitized: request-controlled fields cannot inject terminal lines.
    const line =
      `[SEC][${service}][${clean(String(e.level).toUpperCase(), 10)}][${e.ts}][${clean(e.ip, 48)}][${clean(e.route, 120)}] ${clean(e.kind, 40)} — ${clean(e.detail, 300)}` +
      (e.hint ? ` | Hint: ${clean(e.hint, 200)}` : "") +
      (e.source ? ` (${clean(e.source, 12)}${e.online != null ? (e.online ? ", online" : ", offline") : ""})` : "") +
      (e.dup ? " [repeat]" : "");
    try {
      if (process.env.NO_COLOR) console.log(line);
      else console.log((COLORS[e.level] || "") + line + RESET);
    } catch {
      try {
        console.log(line);
      } catch {}
    }
  }

  function touchIncident(e) {
    // Only aggregatable kinds collapse; operational notices stay 1:1.
    if (!AGG_KINDS.has(String(e.kind || ""))) return null;
    const key = aggregateKey(e);
    const now = Date.parse(e.ts) || Date.now();
    let inc = incidents.get(key);
    if (inc && now - inc.lastMs < INCIDENT_WINDOW_MS) {
      inc.count += 1;
      inc.lastTs = e.ts;
      inc.lastMs = now;
      if ((LEVELS[e.level] ?? 0) > (LEVELS[inc.maxLevel] ?? 0)) inc.maxLevel = e.level;
      if (e.status != null) inc.statuses[String(e.status)] = (inc.statuses[String(e.status)] || 0) + 1;
      if (incidents.size > 2000) incidents.delete(incidents.keys().next().value);
      return inc;
    }
    inc = {
      key,
      kind: e.kind,
      class: e.class || "notice",
      ip: e.ip,
      route: e.route,
      category: e.category || "",
      count: 1,
      firstTs: e.ts,
      lastTs: e.ts,
      lastMs: now,
      maxLevel: e.level,
      sample: String(e.detail || "").slice(0, 220),
      hint: String(e.hint || "").slice(0, 220),
      statuses: e.status != null ? { [String(e.status)]: 1 } : {},
    };
    incidents.set(key, inc);
    if (incidents.size > 2000) incidents.delete(incidents.keys().next().value);
    return null; // fresh incident
  }

  function log({ level = "info", kind = "event", ip = "-", route = "-", detail = "", hint = "", source = "local", online = null, status = null, reqId = "", category = "" } = {}) {
    const e = {
      ts: new Date().toISOString(),
      level: LEVELS[level] != null ? level : "info",
      kind: String(kind || "event").slice(0, 60),
      ip: String(ip || "-").slice(0, 64),
      route: String(route || "-").slice(0, 200),
      detail: String(detail || "").slice(0, 1000),
      hint: String(hint || "").slice(0, 500),
      source: String(source || "local").slice(0, 20),
      service,
    };
    if (online !== null && online !== undefined) e.online = !!online;
    if (status !== null && status !== undefined) e.status = Number(status);
    if (reqId) e.reqId = String(reqId).slice(0, 16);
    if (category) e.category = String(category).slice(0, 24);
    e.class = classifyEvent(e);
    const repeat = touchIncident(e);
    if (repeat) {
      e.dup = true;
      e.incidentCount = repeat.count;
    }
    events.push(e);
    if (events.length > 1000) events.splice(0, events.length - 1000);
    print(e);
    try {
      const line = JSON.stringify(e) + "\n";
      appendRotating(line).catch(() => {});
    } catch {}
    // Only a FRESH medium+ incident writes a PDF — repeats inside one throttle
    // window never mint new "breaches".
    if (!e.dup && (LEVELS[e.level] ?? 0) >= LEVELS.medium) schedulePdf();
    return e;
  }

  async function appendRotating(line) {
    approxBytes += Buffer.byteLength(line);
    await mkdir(dir, { recursive: true });
    if (approxBytes > MAX_JSONL_BYTES) {
      try {
        await rename(jsonl, jsonl + ".prev");
      } catch {}
      approxBytes = Buffer.byteLength(line);
    }
    await appendFile(jsonl, line);
  }

  function schedulePdf() {
    if (pdfTimer) {
      pendingPdf = true;
      return;
    }
    pdfTimer = setTimeout(async () => {
      pdfTimer = null;
      try {
        await writeLatestPdf();
      } catch {}
      if (pendingPdf) {
        pendingPdf = false;
        schedulePdf();
      }
    }, 2000);
    if (pdfTimer.unref) pdfTimer.unref();
  }

  function incidentList() {
    return [...incidents.values()].sort((a, b) => (a.lastMs < b.lastMs ? 1 : -1));
  }

  // Unique incidents needing review (the honest "breach" count): fresh
  // security-incidents plus high/critical blocked-requests. Throttles and
  // single low blocks never count.
  function incidentsNeedingReview() {
    return incidentList().filter((inc) => {
      if (inc.class === "security-incident") return true;
      if ((LEVELS[inc.maxLevel] ?? 0) >= LEVELS.high && inc.class === "blocked-request") return true;
      return false;
    });
  }

  async function writeLatestPdf() {
    const list = incidentList();
    const review = incidentsNeedingReview();
    // Same 7-area board inside every auto-written PDF (best effort — the
    // incident evidence below is authoritative even when the board skips).
    let statusRows = null;
    try {
      const { runSecurityChecks } = await import("./security-checks.mjs");
      statusRows = await runSecurityChecks(base);
    } catch { statusRows = null; }
    const buf = buildPdfBuffer(events.slice(-300), review.length, list.slice(-120), statusRows);
    try {
      await mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      await writeFile(path.join(dir, `security-report-${stamp}.pdf`), buf);
      await writeFile(path.join(dir, "security-report-latest.pdf"), buf);
      const done = {
        ts: new Date().toISOString(),
        level: "info",
        kind: "pdf",
        class: "notice",
        ip: "-",
        route: "-",
        detail: `security PDF written (${review.length} incident${review.length === 1 ? "" : "s"} needing review, ${list.length} unique incidents, ${events.length} raw events) -> data/security-report-latest.pdf`,
        hint: "open the file or, as admin, GET /__security/report.pdf",
        source: "local",
        service,
      };
      events.push(done);
      if (events.length > 1000) events.splice(0, events.length - 1000);
      print(done);
      try {
        await appendRotating(JSON.stringify(done) + "\n").catch(() => {});
      } catch {}
      return path.join(dir, "security-report-latest.pdf");
    } catch {
      return null;
    }
  }

  function getEvents(limit = 200) {
    return events.slice(-Math.max(1, Math.min(1000, limit))).reverse();
  }

  function getIncidents(limit = 200) {
    return incidentList().slice(0, Math.max(1, Math.min(1000, limit)));
  }

  // Polls the live deploy so the LOCAL terminal narrates the LIVE box too.
  // getLiveUrl: async () => "https://xxx.onrender.com" or "" (standalone).
  function startLiveWatch({ getLiveUrl, intervalMs = 60000 } = {}) {
    const tick = async () => {
      let url = "";
      try {
        url = (await getLiveUrl()) || "";
      } catch {
        url = "";
      }
      if (!url) return;
      const clean = String(url).replace(/\/+$/, "");
      let ctrl = null;
      let timer = 0;
      try {
        if (typeof AbortController !== "undefined") {
          ctrl = new AbortController();
          timer = setTimeout(() => {
            try {
              ctrl.abort();
            } catch {}
          }, 15000);
        }
        const r = await fetch(clean + "/version.json?t=" + Date.now(), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
        if (timer) clearTimeout(timer);
        if (r && r.ok) {
          if (liveOnline !== true) {
            liveOnline = true;
            log({ level: "info", kind: "live-online", ip: "-", route: clean, detail: "live deploy reachable", source: "live", online: true });
          }
        } else {
          if (liveOnline !== false) {
            liveOnline = false;
            log({
              level: "medium",
              kind: "live-offline",
              ip: "-",
              route: clean,
              detail: `live deploy answered ${r ? r.status : "no response"}`,
              hint: "check the host logs; on Render free tier this is usually a sleep — a keep-awake ping (e.g. UptimeRobot every 5 min to /version.json) avoids the 30-60s cold boot. Office copy keeps serving baked words and syncs on return.",
              source: "live",
              online: false,
            });
          }
        }
      } catch {
        if (timer) clearTimeout(timer);
        if (liveOnline !== false) {
          liveOnline = false;
          log({
            level: "medium",
            kind: "live-offline",
            ip: "-",
            route: clean,
            detail: "live deploy unreachable (offline, sleeping, or no network)",
            hint: "check host logs / keep-awake ping; office copy keeps serving baked words and syncs on return.",
            source: "live",
            online: false,
          });
        }
      }
    };
    tick().catch(() => {});
    const h = setInterval(() => {
      tick().catch(() => {});
    }, intervalMs);
    if (h.unref) h.unref();
    return () => clearInterval(h);
  }

  return { log, getEvents, getIncidents, getPersistence, incidentsNeedingReview, writeLatestPdf, startLiveWatch, buildPdf: () => buildPdfBuffer(events.slice(-300), incidentsNeedingReview().length, incidentList().slice(-120)), _events: events };
}
