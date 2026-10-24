// security-log.mjs — real-time security event log for `npm run dev` and `npm start`.
// Zero dependencies (keeps frontend/backend deploys fast). Best-effort: never throws.
//
// What it does:
// - Every security-relevant event is printed to the terminal immediately,
//   with severity, IP address, route, and a hint on what to do.
// - Events are appended to data/security-events.jsonl (survives restarts).
// - When a potential breach (medium+) is logged, a PDF report is written to
//   data/security-report-latest.pdf (plus a timestamped copy) and the terminal
//   tells you exactly where it is. /__security/report.pdf serves the same PDF
//   to a signed-in admin.
// - startLiveWatch() polls the live deploy's /version.json and logs
//   online/offline transitions, so the local terminal tells you what happens
//   on the live deploy whether it is online or offline.
import { appendFile, mkdir, writeFile } from "node:fs/promises";
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

function ascii(s) {
  return String(s || "").replace(/[^\x20-\x7e]/g, "?");
}

function pdfEscape(s) {
  return ascii(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").slice(0, 220);
}

// Minimal multi-page PDF writer (Helvetica only, no deps).
export function buildPdfBuffer(allEvents, breachCount) {
  const events = Array.isArray(allEvents) ? allEvents.slice(-300) : [];
  const generated = new Date().toISOString();
  const title = "Security report — World Overcomers website";
  const sub = `Generated ${generated}  |  potential breaches: ${breachCount}  |  events shown: ${events.length}`;
  const lines = [];
  lines.push(title);
  lines.push(sub);
  lines.push("");
  if (!events.length) {
    lines.push("No security events recorded yet.");
    lines.push("The WAF and session-anomaly detector log here in real time.");
  } else {
    for (const e of events) {
      const head = `[${e.ts || "?"}][${String(e.level || "info").toUpperCase()}][${e.ip || "-"}][${e.route || "-"}] ${e.kind || "event"}`;
      lines.push(head);
      if (e.detail) lines.push(`  detail: ${e.detail}`);
      if (e.hint) lines.push(`  hint: ${e.hint}`);
      if (e.source) lines.push(`  source: ${e.source}${e.online != null ? (e.online ? " (online)" : " (offline)") : ""}`);
      lines.push("");
    }
  }
  // paginate: ~48 lines per A4 page at 9pt
  const PER_PAGE = 48;
  const pages = [];
  for (let i = 0; i < lines.length; i += PER_PAGE) pages.push(lines.slice(i, i + PER_PAGE));
  if (!pages.length) pages.push(["No events."]);
  const objects = [];
  // object numbering: 1 catalog, 2 pages, 3 font, then per page: page obj + content obj
  const pageObjs = [];
  let n = 4;
  for (const _ of pages) {
    pageObjs.push({ page: n, content: n + 1 });
    n += 2;
  }
  const fontObj = 3;
  function textStream(pageLines) {
    let s = "BT /F1 9 Tf 40 800 Td 11 TL ";
    pageLines.forEach((ln, i) => {
      if (i > 0) s += "T* ";
      s += `(${pdfEscape(ln)}) Tj `;
    });
    s += "ET";
    return s;
  }
  const pageRefs = pageObjs.map((p) => `${p.page} 0 R`).join(" ");
  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>\nendobj\n`;
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  pages.forEach((pl, i) => {
    const { page, content } = pageObjs[i];
    objects[page] = `${page} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${content} 0 R >>\nendobj\n`;
    const stream = textStream(pl);
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
  const dir = path.join(rootDir || process.cwd(), "data");
  const jsonl = path.join(dir, "security-events.jsonl");
  const events = [];
  let liveOnline = null;
  let pdfTimer = null;
  let pendingPdf = false;

  function print(e) {
    const color = COLORS[e.level] || "";
    const line =
      `[SEC][${service}][${String(e.level).toUpperCase()}][${e.ts}][${e.ip}][${e.route}] ${e.kind} — ${e.detail}` +
      (e.hint ? ` | Hint: ${e.hint}` : "") +
      (e.source ? ` (${e.source}${e.online != null ? (e.online ? ", online" : ", offline") : ""})` : "");
    try {
      if (process.env.NO_COLOR) console.log(line);
      else console.log(color + line + RESET);
    } catch {
      try {
        console.log(line);
      } catch {}
    }
  }

  function log({ level = "info", kind = "event", ip = "-", route = "-", detail = "", hint = "", source = "local", online = null } = {}) {
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
    events.push(e);
    if (events.length > 1000) events.splice(0, events.length - 1000);
    print(e);
    try {
      const line = JSON.stringify(e) + "\n";
      mkdir(dir, { recursive: true })
        .then(() => appendFile(jsonl, line).catch(() => {}))
        .catch(() => {});
    } catch {}
    if ((LEVELS[e.level] ?? 0) >= LEVELS.medium) schedulePdf();
    return e;
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

  async function writeLatestPdf() {
    const breaches = events.filter((e) => (LEVELS[e.level] ?? 0) >= LEVELS.medium);
    const buf = buildPdfBuffer(events.slice(-300), breaches.length);
    try {
      await mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      await writeFile(path.join(dir, `security-report-${stamp}.pdf`), buf);
      await writeFile(path.join(dir, "security-report-latest.pdf"), buf);
      const done = {
        ts: new Date().toISOString(),
        level: "info",
        kind: "pdf",
        ip: "-",
        route: "-",
        detail: `security PDF written (${breaches.length} potential breach${breaches.length === 1 ? "" : "es"}) -> data/security-report-latest.pdf`,
        hint: "open the file or, as admin, GET /__security/report.pdf",
        source: "local",
        service,
      };
      events.push(done);
      if (events.length > 1000) events.splice(0, events.length - 1000);
      print(done);
      try {
        await appendFile(jsonl, JSON.stringify(done) + "\n").catch(() => {});
      } catch {}
      return path.join(dir, "security-report-latest.pdf");
    } catch {
      return null;
    }
  }

  function getEvents(limit = 200) {
    return events.slice(-Math.max(1, Math.min(1000, limit))).reverse();
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

  return { log, getEvents, writeLatestPdf, startLiveWatch, buildPdf: () => buildPdfBuffer(events.slice(-300), events.filter((e) => (LEVELS[e.level] ?? 0) >= LEVELS.medium).length), _events: events };
}
