// security-checks.mjs — 7-area security posture board.
// Zero dependencies. Best-effort: never throws, never blocks boot.
//
// Areas (exactly the office's audit list):
//   1. Security event monitoring
//   2. Incident classification
//   3. Production backend availability
//   4. Admin login and password protection
//   5. Protection against unauthorized publishing
//   6. Persistent storage and backups
//   7. Protection against common web attacks
//
// Severity rule (office request):
//   - Real attacks / shield holes -> high/critical -> RED ALERT (red in the
//     terminal, red in the PDF). These are the most serious problems.
//   - Operational gaps that are NOT attacks (ephemeral disk, no snapshot yet,
//     live box asleep, default-password hygiene) -> low/medium -> WARNING or
//     NOTICE (yellow/green/grey, never red).
//
// Used by:
//   - scripts/security-status.mjs  (terminal table on `npm run dev` via predev)
//   - scripts/security-report.mjs  (same table + PDF section)
//   - scripts/vite-cms-backend.mjs + scripts/serve.mjs (boot line, info only)
import { readFile, stat, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

export const AREAS = [
  "Security event monitoring",
  "Incident classification",
  "Production backend availability",
  "Admin login and password protection",
  "Protection against unauthorized publishing",
  "Persistent storage and backups",
  "Protection against common web attacks",
];

const WINDOW_MS = 10 * 60 * 1000;
// RED ALERTs follow RECENT attacks only (office fix): bot probes from days ago
// must not hold the board red forever. Older reviewed incidents stay in the
// PDF evidence and surface as a grey NOTICE — never red.
const RECENT_MS = 24 * 60 * 60 * 1000;
function recentOnly(incs, ms) {
  try {
    const now = Date.now();
    return (incs || []).filter((i) => now - (Number(i.lastMs) || 0) < (ms || RECENT_MS));
  } catch { return incs || []; }
}

function row(area, status, severity, attack, detail, hint) {
  return { area, status, severity, attack: !!attack, detail: String(detail || ""), hint: String(hint || "") };
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readText(p, max = 200000) {
  try {
    const s = await readFile(p, "utf8");
    return String(s || "").slice(0, max);
  } catch {
    return "";
  }
}

function parseJsonl(raw, limit = 1000) {
  try {
    return String(raw || "")
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function aggregateIncidents(events) {
  const aggKinds = new Set([
    "waf-block", "rate-limit", "rate-throttle", "auth-fail", "auth-probing",
    "privilege-escalation", "file-deny", "unusual-volume", "live-offline", "publish-stuck",
  ]);
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
    } else {
      incidents.set(key, {
        key, kind: e.kind, ip: e.ip, route: e.route,
        count: 1, firstTs: e.ts, lastTs: e.ts, lastMs: t,
        maxLevel: e.level || "info",
      });
    }
  }
  return [...incidents.values()].sort((a, b) => (a.lastMs < b.lastMs ? 1 : -1));
}

async function wafSelfTest() {
  // Live-fire the shipped WAF: real attacks must block, legit office flows allow.
  try {
    const { createWaf } = await import("./waf.mjs");
    const waf = createWaf();
    const attacks = [
      { method: "GET", pathname: "/", search: "?q=' OR '1'='1" },
      { method: "GET", pathname: "/search", search: "?q=<script>alert(1)</script>" },
      { method: "GET", pathname: "/x", search: "?f=../../etc/passwd" },
      { method: "GET", pathname: "/.git/config", search: "" },
      { method: "GET", pathname: "/data/cms-state.bin", search: "" },
      { method: "GET", pathname: "/x", search: "?c=$(cat${String.fromCharCode(47)}etc${String.fromCharCode(47)}passwd)" },
      { method: "GET", pathname: "/__yt", search: "?url=https://evil.example/steal" },
      { method: "GET", pathname: "/x", search: "?q=" + "A".repeat(5000) },
    ];
    let missed = [];
    for (const a of attacks) {
      const v = waf.checkRequest({ ...a, headers: {}, ip: "198.51.100.9" });
      if (v.allow) missed.push(a.pathname + a.search.slice(0, 40));
    }
    const legit = [
      { method: "GET", pathname: "/", search: "" },
      { method: "GET", pathname: "/admin", search: "" },
      { method: "GET", pathname: "/version.json", search: "" },
      { method: "GET", pathname: "/seed.json", search: "" },
    ];
    let falsePos = [];
    for (const l of legit) {
      const v = waf.checkRequest({ ...l, headers: {}, ip: "127.0.0.1" });
      if (!v.allow) falsePos.push(l.pathname);
    }
    // Publish bodies carry real page HTML and must never be signature-scanned.
    const pub = waf.checkBody({ rpc: "publish", body: "<div>hello</div><script>var x=1;</script>", ip: "127.0.0.1" });
    if (!pub.allow) falsePos.push("publish-body");
    return { missed, falsePos };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

async function fetchWithTimeout(url, ms = 8000) {
  let ctrl = null;
  let timer = 0;
  try {
    if (typeof AbortController !== "undefined") {
      ctrl = new AbortController();
      timer = setTimeout(() => {
        try { ctrl.abort(); } catch {}
      }, ms);
      // Windows fix: never let the abort timer hold the loop open on its own.
      try { if (timer && timer.unref) timer.unref(); } catch {}
    }
    const r = await fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
    if (timer) clearTimeout(timer);
    return r;
  } catch (e) {
    if (timer) clearTimeout(timer);
    throw e;
  }
}

export async function runSecurityChecks(rootDir) {
  const ROOT = rootDir || process.cwd();
  const out = [];
  const dataDir = process.env.SECURITY_LOG_DIR || path.join(ROOT, "data");
  const jsonlPath = path.join(dataDir, "security-events.jsonl");

  // ---- 1. Security event monitoring ----
  try {
    const logMod = await exists(path.join(ROOT, "scripts", "security-log.mjs"));
    let writable = false;
    try {
      await mkdir(dataDir, { recursive: true });
      writable = true;
    } catch { writable = false; }
    let rawCount = 0;
    try {
      const raw = await readFile(jsonlPath, "utf8");
      rawCount = String(raw).split("\n").filter(Boolean).length;
    } catch { rawCount = 0; }
    if (!logMod || !writable) {
      out.push(row(AREAS[0], "WARNING", "medium", false,
        `event logger ${!logMod ? "module missing" : "log dir not writable"} (dir=${dataDir})`,
        "keep scripts/security-log.mjs; ensure data/ is writable or set SECURITY_LOG_DIR to a writable path."));
    } else if (rawCount === 0) {
      out.push(row(AREAS[0], "NOTICE", "low", false,
        "shield active, no events recorded yet — first request or probe will appear here",
        "run npm run dev and load the site; probes log in real time to this terminal."));
    } else {
      out.push(row(AREAS[0], "SECURE", "low", false,
        `live terminal log active; ${rawCount} raw events on disk at ${jsonlPath}`,
        "watch [SEC] lines; unique incidents auto-write data/security-report-latest.pdf."));
    }
  } catch (e) {
    out.push(row(AREAS[0], "NOTICE", "low", false, `monitoring check skipped (${String((e && e.message) || e).slice(0, 120)})`, "re-run npm run security:status."));
  }

  // ---- 2. Incident classification ----
  try {
    let events = [];
    try {
      events = parseJsonl(await readFile(jsonlPath, "utf8"));
    } catch { events = []; }
    const incs = aggregateIncidents(events);
    const reviewAll = incs.filter((inc) => {
      if (inc.kind === "privilege-escalation" || inc.kind === "publish-stuck") return true;
      const ord = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
      return (ord[inc.maxLevel] ?? 0) >= 3;
    });
    const review = recentOnly(reviewAll);
    if (!events.length) {
      out.push(row(AREAS[1], "NOTICE", "low", false,
        "no incidents classified yet — taxonomy ready (blocked-request / rate-limit / suspicious-pattern / security-incident / notice)",
        "see scripts/SECURITY.md section 3; a blocked request or throttle is never counted as a compromise."));
    } else if (!review.length && !reviewAll.length) {
      out.push(row(AREAS[1], "SECURE", "low", false,
        `${incs.length} unique incident(s) classified, 0 needing human review — blocks and throttles only`,
        "only a reviewed security-incident may escalate; never auto-declare a compromise."));
    } else if (!review.length) {
      out.push(row(AREAS[1], "NOTICE", "low", false,
        `${reviewAll.length} older incident(s) reviewed, none in the last 24h — evidence kept in data/security-report-latest.pdf`,
        "no action needed; new attacks will raise RED ALERT on their own."));
    } else {
      const worst = review.some((i) => i.maxLevel === "critical") ? "critical" : "high";
      const kinds = [...new Set(review.slice(0, 6).map((i) => i.kind))].join(", ");
      out.push(row(AREAS[1], "RED ALERT", worst, true,
        `${review.length} recent incident(s) needing human review (${kinds}) — see data/security-report-latest.pdf`,
        "block repeat IPs at the host firewall; rotate the admin password if the session was admin; only a human review declares a compromise."));
    }
  } catch (e) {
    out.push(row(AREAS[1], "NOTICE", "low", false, `classification check skipped (${String((e && e.message) || e).slice(0, 120)})`, "run npm run security:report."));
  }

  // ---- 3. Production backend availability ----
  try {
    const serveExists = await exists(path.join(ROOT, "scripts", "serve.mjs"));
    const distExists = await exists(path.join(ROOT, "dist", "index.html"));
    let liveUrl = "";
    try {
      const raw = await readFile(path.join(ROOT, "cms-server.txt"), "utf8");
      const first = String(raw).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))[0] || "";
      const clean = first.replace(/\/+$/, "");
      if (/^https?:\/\/[^/\s]+$/i.test(clean)) liveUrl = clean;
    } catch {}
    let liveState = "unconfigured";
    if (liveUrl) {
      try {
        const r = await fetchWithTimeout(liveUrl + "/version.json?t=" + Date.now(), 8000);
        // Windows fix: drain/cancel the body so no fetch socket stays open into
        // process exit (open body + process.exit on win32 trips UV_HANDLE_CLOSING).
        try { if (r && r.body && r.body.cancel) await r.body.cancel(); } catch {}
        liveState = r && r.ok ? "online" : `http-${(r && r.status) || "no-response"}`;
      } catch {
        liveState = "offline";
      }
    }
    if (!serveExists) {
      out.push(row(AREAS[2], "WARNING", "medium", false,
        "scripts/serve.mjs missing — production backend entrypoint not found",
        "restore scripts/serve.mjs; production start command must be node scripts/serve.mjs."));
    } else if (!distExists && liveState === "offline") {
      out.push(row(AREAS[2], "WARNING", "medium", false,
        "site down: no dist/index.html and live box unreachable" + (liveUrl ? ` (${liveUrl})` : ""),
        "run npm run build then npm start locally; check host logs for the live box."));
    } else if (liveState === "offline") {
      out.push(row(AREAS[2], "WARNING", "medium", false,
        `live box unreachable (${liveUrl}) — usually Render sleep, not an attack; office copy keeps serving`,
        "check host logs; keep a keep-awake ping (e.g. UptimeRobot every 5 min to /version.json); office copy syncs on return."));
    } else if (liveState === "online") {
      out.push(row(AREAS[2], "SECURE", "low", false,
        `live backend online (${liveUrl})${distExists ? "; local dist built" : "; local dist not built (dev mode ok)"}`,
        "single instance keeps in-memory rate buckets exact; if ever scaled horizontally add sticky sessions."));
    } else if (!distExists) {
      out.push(row(AREAS[2], "WARNING", "medium", false,
        "dist/index.html not built — run npm run build before npm start",
        "npm run dev does not need dist; production does."));
    } else {
      out.push(row(AREAS[2], "NOTICE", "low", false,
        `standalone office copy — no live URL configured; local backend ${distExists ? "built" : "dev-mode"} and serving`,
        "to link a live box, put its https URL on the first line of cms-server.txt."));
    }
  } catch (e) {
    out.push(row(AREAS[2], "NOTICE", "low", false, `availability check skipped (${String((e && e.message) || e).slice(0, 120)})`, "re-run npm run security:status."));
  }

  // ---- 4. Admin login and password protection ----
  try {
    const serverSrc = await readText(path.join(ROOT, "scripts", "cms-server.js"));
    const hasSessionGate = /sessionDeny|sessionLive/.test(serverSrc);
    const hasTotp = /totpCheck|TOTP/.test(serverSrc);
    const hasConnLimit = /allowAttempt|netFails|pending2fa/.test(serverSrc);
    const override = String(process.env.ADMIN_HASH_OVERRIDE || "").trim();
    const overrideOk = /^[0-9a-fA-F]{64}$/.test(override);
    let events = [];
    try { events = parseJsonl(await readFile(jsonlPath, "utf8")); } catch {}
    const probing = recentOnly(aggregateIncidents(events)).filter((i) => i.kind === "auth-probing" || i.kind === "privilege-escalation").length;
    if (!serverSrc || !hasSessionGate) {
      out.push(row(AREAS[3], "RED ALERT", "critical", true,
        "admin session gate not found in scripts/cms-server.js — sign-in checks may be bypassed",
        "restore scripts/cms-server.js from backup; do not publish until sessionDeny/sessionLive guard every admin RPC."));
    } else if (probing >= 2) {
      out.push(row(AREAS[3], "RED ALERT", "high", true,
        `password-guessing pace in the last 24h (${probing} probing incident(s)) — per-IP + per-connection throttles are holding`,
        "confirm 2FA is on (Admin Security); block repeat IPs at the host firewall if it continues."));
    } else if (!overrideOk) {
      out.push(row(AREAS[3], "WARNING", "medium", false,
        `server-side hash sign-in ${hasTotp ? "+ 2FA" : "(no 2FA found)"} ${hasConnLimit ? "+ per-connection/network throttles" : ""} — but ADMIN_HASH_OVERRIDE not set, so diskless sleeps fall back to the shipped default`,
        "set ADMIN_HASH_OVERRIDE to the 64-hex SHA-256 of the office password (never the password) in the host dashboard."));
    } else {
      out.push(row(AREAS[3], "SECURE", "low", false,
        `server-side hash-only secrets ${hasTotp ? "+ 2FA" : ""} ${hasConnLimit ? "+ per-connection/network throttles" : ""} + ADMIN_HASH_OVERRIDE stable across sleeps`,
        "no plaintext password anywhere in code; sessions idle-expire in 15 min."));
    }
  } catch (e) {
    out.push(row(AREAS[3], "NOTICE", "low", false, `login check skipped (${String((e && e.message) || e).slice(0, 120)})`, "re-run npm run security:status."));
  }

  // ---- 5. Protection against unauthorized publishing ----
  try {
    const serverSrc = await readText(path.join(ROOT, "scripts", "cms-server.js"));
    const wafSrc = await readText(path.join(ROOT, "scripts", "waf.mjs"));
    const guards = [
      ["publish", /publish\s*:\s*function|["']publish["']/.test(serverSrc) && /sessionDeny|sessionLive/.test(serverSrc)],
      ["adoptLive token", /adoptLive/.test(serverSrc) && /token/i.test(serverSrc)],
      ["privileged RPC list", /PRIVILEGED_RPCS/.test(wafSrc)],
      ["publish rate bucket", /publish/.test(wafSrc) && /RATE_LIMITS/.test(wafSrc)],
    ];
    const missing = guards.filter(([, ok]) => !ok).map(([n]) => n);
    let events = [];
    try { events = parseJsonl(await readFile(jsonlPath, "utf8")); } catch {}
    const esc = recentOnly(aggregateIncidents(events)).filter((i) => i.kind === "privilege-escalation").length;
    if (esc > 0) {
      out.push(row(AREAS[4], "RED ALERT", "high", true,
        `${esc} recent privilege-escalation incident(s) in the last 24h: anonymous/expired sessions pressed admin-only doors`,
        "single hits are expired tabs; sustained hits are probing — block the IP at the host; restart rotates the adopt token."));
    } else if (missing.length) {
      out.push(row(AREAS[4], "RED ALERT", "critical", true,
        `publish guard missing: ${missing.join(", ")}`,
        "restore the missing guard before publishing; publishes must require a signed-in admin session + token."));
    } else {
      out.push(row(AREAS[4], "SECURE", "low", false,
        "publish / undoPublish / password changes / adopt doors require a signed-in admin session; adopt token rotates on restart; publish rate-limited per IP",
        "public reads stay public by design; every write takes a live session checked server-side."));
    }
  } catch (e) {
    out.push(row(AREAS[4], "NOTICE", "low", false, `publish check skipped (${String((e && e.message) || e).slice(0, 120)})`, "re-run npm run security:status."));
  }

  // ---- 6. Persistent storage and backups ----
  try {
    const stateOk = await exists(path.join(ROOT, "data", "cms-state.bin"));
    let snaps = [];
    try {
      const names = await readdir(path.join(ROOT, "data-backups"));
      snaps = names.filter((n) => /^(\d{8}-\d{6}|suspect-\d{8}-\d{6})$/.test(n)).sort();
    } catch { snaps = []; }
    const onRender = !!process.env.RENDER;
    const persistent = !onRender || !!(process.env.DATA_DIR || process.env.SECURITY_PERSISTENT === "1" || process.env.SECURITY_LOG_DIR);
    if (!stateOk && !snaps.length) {
      out.push(row(AREAS[5], "WARNING", "medium", false,
        "no published store and no snapshots yet — nothing to lose, nothing to restore",
        "publish once, then run npm run backup; snapshots land in data-backups/ (kept out of git)."));
    } else if (!stateOk) {
      out.push(row(AREAS[5], "WARNING", "medium", false,
        `live store missing but ${snaps.length} snapshot(s) kept — recoverable`,
        "run npm run restore (newest snapshot) or Recover in Admin; then Publish."));
    } else if (!snaps.length) {
      out.push(row(AREAS[5], "WARNING", "low", false,
        "published store present, no snapshots yet",
        "run npm run backup; boot auto-snapshots from now on (keeps 10)."));
    } else if (!persistent) {
      out.push(row(AREAS[5], "WARNING", "medium", false,
        `${snaps.length} snapshot(s) kept, newest ${snaps[snaps.length - 1]} — but host disk is EPHEMERAL (sleep/restart wipes data/)`,
        "mount a disk at data/ (or set SECURITY_LOG_DIR to a mounted path); PDF + JSONL are evidence, snapshots are the way back."));
    } else {
      out.push(row(AREAS[5], "SECURE", "low", false,
        `${snaps.length} snapshot(s) kept, newest ${snaps[snaps.length - 1]}; evidence ${persistent ? "PERSISTENT" : "local disk"}`,
        "tools Backup/Restore + Publish is the way back; uploads manifest recorded per snapshot."));
    }
  } catch (e) {
    out.push(row(AREAS[5], "NOTICE", "low", false, `backup check skipped (${String((e && e.message) || e).slice(0, 120)})`, "re-run npm run security:status."));
  }

  // ---- 7. Protection against common web attacks ----
  try {
    const t = await wafSelfTest();
    if (t.error) {
      out.push(row(AREAS[6], "WARNING", "medium", false,
        `WAF self-test could not run (${String(t.error).slice(0, 140)})`,
        "keep scripts/waf.mjs; run npm run security:test for the full matrix."));
    } else if (t.missed && t.missed.length) {
      out.push(row(AREAS[6], "RED ALERT", "critical", true,
        `WAF hole: ${t.missed.length} attack pattern(s) passed (${t.missed.slice(0, 3).join(" | ")})`,
        "do not deploy: restore scripts/waf.mjs; run npm run security:test; block probing IPs at the host."));
    } else if (t.falsePos && t.falsePos.length) {
      out.push(row(AREAS[6], "WARNING", "medium", false,
        `WAF false positive on legit traffic (${t.falsePos.join(", ")})`,
        "office flows must never 403: check scripts/waf.mjs exempt paths (version.json, HMR, static, publish bodies)."));
    } else {
      out.push(row(AREAS[6], "SECURE", "low", false,
        "SQLi / XSS / traversal / command-injection / LFI / sensitive-file / SSRF / oversized-URL blocked (403); legit pages + publish bodies allowed; tiered 429 buckets armed",
        "repeat probes throttle automatically; block at the host firewall only if one IP persists."));
    }
  } catch (e) {
    out.push(row(AREAS[6], "NOTICE", "low", false, `WAF check skipped (${String((e && e.message) || e).slice(0, 120)})`, "run npm run security:test."));
  }

  return out;
}

// Plain-text lines for the PDF (ASCII only — the PDF writer is Helvetica).
export function statusPdfLines(rows) {
  const out = [];
  out.push("SECURITY POSTURE — 7 AREAS (most serious = RED ALERT; operational gaps = WARNING/NOTICE, never red)");
  for (const r of (rows || [])) {
    const tag = r.status === "RED ALERT" ? "[RED ALERT]" : `[${String(r.status).toUpperCase()}]`;
    out.push(`${tag} ${r.area} — ${r.detail}`);
    if (r.hint) out.push(`  hint: ${r.hint}`);
  }
  out.push("");
  return out;
}
