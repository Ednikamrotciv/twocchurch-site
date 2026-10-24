// security-report.mjs — `npm run security:report`
// Prints the recent security log to the terminal and (re)writes the PDF.
// Zero dependencies. Reads data/security-events.jsonl (best effort).
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPdfBuffer } from "./security-log.mjs";

const ROOT = process.cwd();
const dir = path.join(ROOT, "data");
const jsonl = path.join(dir, "security-events.jsonl");

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
    .slice(-300);
} catch {
  events = [];
}

const order = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const breaches = events.filter((e) => (order[e.level] ?? 0) >= 2);
console.log(`security report: ${events.length} events, ${breaches.length} potential breach(es)`);
for (const e of events.slice(-50)) {
  console.log(`[${e.ts}][${String(e.level).toUpperCase()}][${e.ip}][${e.route}] ${e.kind} — ${e.detail}${e.hint ? ` | Hint: ${e.hint}` : ""}`);
}
try {
  await mkdir(dir, { recursive: true });
  const buf = buildPdfBuffer(events, breaches.length);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const p1 = path.join(dir, `security-report-${stamp}.pdf`);
  const p2 = path.join(dir, "security-report-latest.pdf");
  await writeFile(p1, buf);
  await writeFile(p2, buf);
  console.log(`PDF written: ${p1}`);
  console.log(`latest copy:  ${p2}`);
  if (!breaches.length) console.log("no potential breaches — nothing to escalate.");
} catch (err) {
  console.error("PDF write failed:", err?.message || err);
  process.exit(1);
}
