// security-ack.mjs — record a human review of a security incident.
// The posture board + report raise RED only for UNACKNOWLEDGED incidents, so a
// triaged alert clears on the next run while the evidence stays on disk.
//
//   npm run security:ack
//     lists incidents needing review (unique kind|ip|route keys, 10-min rule).
//   npm run security:ack -- ack "<kind|ip|route>" "<review note>"
//     records the review in data/security-reviewed.json and appends a
//     review-ack notice to the JSONL audit trail (evidence is never deleted).
//
// Acknowledging requires shell access to the office copy (which already implies
// full control), so this adds no privilege — it only records WHO reviewed WHAT
// and WHEN. A fresh hit re-raises immediately (new 10-min incident, unacked).
// Zero dependencies. Best-effort: never throws.
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const base = process.env.SECURITY_LOG_DIR || path.join(ROOT, "data");
const jsonl = path.join(base, "security-events.jsonl");
const ackPath = path.join(base, "security-reviewed.json");
const WINDOW_MS = 10 * 60 * 1000;
const REVIEW_KINDS = new Set(["privilege-escalation", "publish-stuck"]);

function parseJsonl(raw, limit = 1000) {
  try {
    return String(raw || "").split("\n").filter(Boolean).slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function aggregate(events) {
  const aggKinds = new Set([...REVIEW_KINDS, "waf-block", "rate-limit", "rate-throttle", "auth-fail", "auth-probing", "privilege-escalation", "file-deny", "unusual-volume", "live-offline", "publish-stuck"]);
  const incidents = new Map();
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    if (!aggKinds.has(String(e.kind || ""))) continue;
    const key = [String(e.kind || ""), String(e.ip || ""), String(e.route || "")].join("|");
    const t = Date.parse(e.ts) || 0;
    const inc = incidents.get(key);
    if (inc && t - inc.lastMs < WINDOW_MS) {
      inc.count += 1;
      inc.lastTs = e.ts;
      inc.lastMs = t;
      const ord = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
      if ((ord[e.level] ?? 0) > (ord[inc.maxLevel] ?? 0)) inc.maxLevel = e.level;
      if (!inc.sample && e.detail) inc.sample = String(e.detail).slice(0, 200);
    } else {
      incidents.set(key, { key, kind: e.kind, ip: e.ip, route: e.route, count: 1, firstTs: e.ts, lastTs: e.ts, lastMs: t, maxLevel: e.level || "info", sample: String(e.detail || "").slice(0, 200) });
    }
  }
  return [...incidents.values()].sort((a, b) => (a.lastMs < b.lastMs ? 1 : -1));
}

function needsReview(inc) {
  if (REVIEW_KINDS.has(String(inc.kind || ""))) return true;
  const ord = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return (ord[inc.maxLevel] ?? 0) >= 3;
}

async function readAcked() {
  try {
    const raw = await readFile(ackPath, "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && data.keys && typeof data.keys === "object") return data.keys;
  } catch {}
  return {};
}

async function main() {
  const args = process.argv.slice(2);
  let events = [];
  try { events = parseJsonl(await readFile(jsonl, "utf8")); } catch { events = []; }
  const acked = await readAcked();
  const list = aggregate(events);
  const review = list.filter(needsReview);
  const open = review.filter((i) => !acked[i.key]);
  const done = review.filter((i) => !!acked[i.key]);

  if (args[0] !== "ack") {
    console.log("security review: " + open.length + " incident(s) needing review, " + done.length + " acknowledged, " + list.length + " unique total");
    for (const [n, inc] of open.entries()) {
      console.log("[" + (n + 1) + "][" + inc.lastTs + "][" + String(inc.maxLevel).toUpperCase() + "] " + inc.key + " x" + inc.count);
      if (inc.sample) console.log("    " + inc.sample.slice(0, 200));
    }
    if (done.length) console.log("acknowledged: " + done.map((i) => i.key).join("; "));
    if (!open.length) console.log("nothing needing review — the board stays out of RED.");
    else console.log('record a review with:  npm run security:ack -- ack "<kind|ip|route>" "<what you verified>"');
    return;
  }

  const key = String(args[1] || "");
  const note = String(args.slice(2).join(" ") || "").slice(0, 280);
  if (!key || !key.includes("|")) {
    console.error('usage: npm run security:ack -- ack "<kind|ip|route>" "<review note>"');
    console.error('(run with no args to list the keys needing review)');
    process.exitCode = 2;
    return;
  }
  if (!list.some((i) => i.key === key)) {
    console.error("unknown incident key (run with no args to list them): " + key);
    process.exitCode = 2;
    return;
  }
  if (!note) {
    console.error("a review note is required (what you verified) — evidence stays, the note says why it is closed.");
    process.exitCode = 2;
    return;
  }
  const keys = await readAcked();
  keys[key] = { at: new Date().toISOString(), note };
  try {
    await mkdir(base, { recursive: true });
    await writeFile(ackPath, JSON.stringify({ keys }, null, 2) + "\n", "utf8");
  } catch (e) {
    console.error("could not write " + ackPath + ": " + String((e && e.message) || e));
    process.exitCode = 1;
    return;
  }
  try {
    await mkdir(base, { recursive: true });
    await appendFile(jsonl, JSON.stringify({ ts: new Date().toISOString(), level: "info", kind: "review-ack", class: "notice", ip: "-", route: key, detail: "human review recorded: " + note, source: "local" }) + "\n", "utf8");
  } catch {}
  console.log("review recorded for " + key);
  console.log("the next security:report / security:status run clears it from RED; the evidence + this note stay on disk.");
}

main().catch((e) => { console.error("security:ack failed:", String((e && e.message) || e)); process.exitCode = 1; });
