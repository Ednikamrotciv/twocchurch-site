// security-report.mjs — `npm run security:report`
// Prints the recent security log to the terminal and (re)writes the PDF.
// Counts UNIQUE incidents (repeats from one source+endpoint inside 10 min
// count once) — raw request totals are shown beside them, never as "breaches".
// A blocked request or a throttle is NOT a breach; only reviewed
// security-incidents may escalate (see scripts/SECURITY.md taxonomy).
// Zero dependencies. Reads data/security-events.jsonl (best effort).
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPdfBuffer, classifyEvent, aggregateKey } from "./security-log.mjs";

const ROOT = process.cwd();
const base = process.env.SECURITY_LOG_DIR || path.join(ROOT, "data");
const jsonl = path.join(base, "security-events.jsonl");

let events = [];
try {
  const raw = await readFile(jsonl, "utf8");
  events = raw
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(-1000);
} catch {
  events = [];
}

// Rebuild incidents from the raw log (same 10-min source+endpoint rule as the
// live logger), so the report reflects backend reality, not browser state.
const WINDOW_MS = 10 * 60 * 1000;
const incidents = new Map();
for (const e of events) {
  if (!e || typeof e !== "object") continue;
  if (!e.class) e.class = classifyEvent(e);
  const aggKinds = new Set(["waf-block", "rate-limit", "rate-throttle", "auth-fail", "auth-probing", "privilege-escalation", "file-deny", "unusual-volume", "live-offline", "publish-stuck"]);
  if (!aggKinds.has(String(e.kind || ""))) continue;
  const key = aggregateKey(e);
  const t = Date.parse(e.ts) || 0;
  const inc = incidents.get(key);
  if (inc && t - inc.lastMs < WINDOW_MS) {
    inc.count += 1;
    inc.lastTs = e.ts;
    inc.lastMs = t;
    const ord = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
    if ((ord[e.level] ?? 0) > (ord[inc.maxLevel] ?? 0)) inc.maxLevel = e.level;
  } else {
    incidents.set(key, {
      key,
      kind: e.kind,
      class: e.class,
      ip: e.ip,
      route: e.route,
      category: e.category || "",
      count: 1,
      firstTs: e.ts,
      lastTs: e.ts,
      lastMs: t,
      maxLevel: e.level,
      sample: String(e.detail || "").slice(0, 220),
      hint: String(e.hint || "").slice(0, 220),
    });
  }
}
const list = [...incidents.values()].sort((a, b) => (a.lastMs < b.lastMs ? 1 : -1));
const review = list.filter((inc) => {
  if (inc.class === "security-incident") return true;
  const ord = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return (ord[inc.maxLevel] ?? 0) >= 3 && inc.class === "blocked-request";
});

const byClass = {};
for (const inc of list) byClass[inc.class || "notice"] = (byClass[inc.class || "notice"] || 0) + 1;

const onRender = !!process.env.RENDER;
const persistent = !onRender || !!(process.env.DATA_DIR || process.env.SECURITY_PERSISTENT === "1" || process.env.SECURITY_LOG_DIR);
console.log(`security report: ${events.length} raw events, ${list.length} unique incidents, ${review.length} incident(s) needing review`);
console.log(`by class: ${Object.entries(byClass).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`);
console.log(`evidence persistence: ${persistent ? "PERSISTENT" : "EPHEMERAL — mount a disk at data/ (or set SECURITY_LOG_DIR) to keep evidence across Render sleeps/restarts"}`);
for (const inc of list.slice(0, 50)) {
  console.log(`[${inc.lastTs}][${String(inc.maxLevel).toUpperCase()}][${inc.ip}][${inc.route}] ${inc.kind} x${inc.count} (${inc.class}) — ${inc.sample}`);
}
try {
  await mkdir(base, { recursive: true });
  const buf = buildPdfBuffer(events.slice(-300), review.length, list.slice(-120));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const p1 = path.join(base, `security-report-${stamp}.pdf`);
  const p2 = path.join(base, "security-report-latest.pdf");
  await writeFile(p1, buf);
  await writeFile(p2, buf);
  console.log(`PDF written: ${p1}`);
  console.log(`latest copy:  ${p2}`);
  if (!review.length) console.log("no incidents needing review — nothing to escalate.");
  else console.log(`${review.length} incident(s) needing review — see above; only a human review can declare a compromise.`);
} catch (err) {
  console.error("PDF write failed:", err?.message || err);
  process.exit(1);
}
