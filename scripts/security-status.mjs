// security-status.mjs — `npm run security:status` and the `predev` hook.
// Prints the 7-area security posture table to the terminal on every
// `npm run dev` (via the `predev` script — `dev` itself stays `vite`),
// saves data/security-status.json, and refreshes data/security-report-latest.pdf
// so the PDF carries the same board. Zero dependencies. Never fails the boot:
// exits 0 even when checks find RED ALERTs (alerts are reported, not thrown).
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { runSecurityChecks } from "./security-checks.mjs";

const RED_BG = "\x1b[41m\x1b[37m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const GREY = "\x1b[90m";
const RESET = "\x1b[0m";

function colorFor(r) {
  // Strict rule: only RED ALERT is ever red (attacks / shield holes).
  // WARNING is always yellow, SECURE green, NOTICE grey — non-attacks stay low/medium, never red.
  if (r.status === "RED ALERT") return RED_BG;
  if (r.status === "WARNING") return YELLOW;
  if (r.status === "SECURE") return GREEN;
  return GREY;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

export function printStatusTable(rows) {
  const useColor = !process.env.NO_COLOR;
  const line = (s, c) => console.log(useColor && c ? c + s + RESET : s);
  line("==============================================================");
  line(" SECURITY POSTURE — 7 areas (terminal + PDF)");
  line(" *** RED ALERT = active attack / shield hole (most serious).");
  line("     WARNING / NOTICE = operational gap, NOT an attack (low/medium).");
  line("==============================================================");
  line(` ${pad("Area", 42)} | Status`);
  line(` ${"-".repeat(42)}-+-${"-".repeat(24)}`);
  for (const r of rows) {
    const c = colorFor(r);
    const mark = r.status === "RED ALERT" ? "  <-- RED ALERT" : "";
    const cell = useColor ? c + pad(r.status, 12) + RESET : pad(r.status, 12);
    console.log(` ${pad(r.area, 42)} | ${cell}${mark}`);
    console.log(`   ${String(r.detail).slice(0, 220)}`);
    if (r.hint) console.log(`   Hint: ${String(r.hint).slice(0, 220)}`);
  }
  line("--------------------------------------------------------------");
  const reds = rows.filter((r) => r.status === "RED ALERT");
  if (!reds.length) line(" No RED ALERTs — only low/medium operational notes (not attacks).", GREEN);
  else line(` ${reds.length} RED ALERT(s): ${reds.map((r) => r.area).join("; ")}`, RED_BG);
  line(" Full incident evidence: data/security-report-latest.pdf + data/security-events.jsonl");
}

try {
  const ROOT = process.cwd();
  const rows = await runSecurityChecks(ROOT);
  printStatusTable(rows);
  // Machine-readable copy for the admin UI / PDF pipeline (best effort).
  try {
    const dir = process.env.SECURITY_LOG_DIR || path.join(ROOT, "data");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "security-status.json"), JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
  } catch {}
  // Refresh the PDF so it carries the same board (best effort — never blocks dev).
  try {
    const { buildPdfBuffer } = await import("./security-log.mjs");
    const base = process.env.SECURITY_LOG_DIR || path.join(ROOT, "data");
    let events = [];
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(path.join(base, "security-events.jsonl"), "utf8");
      events = String(raw).split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).slice(-300);
    } catch {}
    const buf = buildPdfBuffer(events, rows.filter((r) => r.status === "RED ALERT").length, null, rows);
    await mkdir(base, { recursive: true });
    await writeFile(path.join(base, "security-report-latest.pdf"), buf);
    console.log("PDF refreshed: data/security-report-latest.pdf (7-area board inside)");
  } catch (e) {
    console.log(`PDF refresh skipped (${String((e && e.message) || e).slice(0, 120)}) — run npm run security:report.`);
  }
  // Windows fix: never force-exit with open fetch/socket handles (win32 libuv
  // UV_HANDLE_CLOSING assertion). Let the loop drain naturally instead.
  process.exitCode = 0;
} catch (e) {
  try { console.log(`security-status: checks skipped (${String((e && e.message) || e).slice(0, 160)})`); } catch {}
  process.exitCode = 0;
}
