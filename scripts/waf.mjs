/* scripts/waf.mjs — ModSecurity-style WAF that sits in FRONT of the entire code.
   Filters malicious traffic patterns before they ever reach the server.

   Two builds, one rule set ("static and context"):
   - context (Node): serve.mjs + vite-cms-backend.mjs call inspectRequest() as the
     FIRST thing in the request handler, before any other door. Blocked traffic
     gets a 403 and never touches cms.call(), uploads, geo, yt, or static files.
   - static (dist): build-static.mjs bakes dist/wom-waf.js from the same patterns
     (see STATIC_GUARD_SRC below) plus security headers (_headers/.htaccess), so
     deployed copies on any static host still neutralise malicious URLs in the
     browser before React boots. The maintenance gate is untouched.

   SAFETY: blocks ONLY on URL/path/query/headers/method — never on JSON bodies —
   so Publish (sermons/testimonies mentioning "select", "<div>", etc.) can never
   false-positive. Body rules are size + null-byte only.
*/

const ALLOW_METHODS = new Set(["GET", "POST", "HEAD", "OPTIONS"]);

export function getClientIp(req) {
  try {
    const fwd = req?.headers?.["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.trim()) {
      const first = fwd.split(",")[0].trim();
      if (first) return cleanIp(first);
    }
    const real = req?.headers?.["x-real-ip"];
    if (typeof real === "string" && real.trim()) return cleanIp(real);
    const remote = req?.socket?.remoteAddress;
    if (typeof remote === "string" && remote) return cleanIp(remote);
  } catch { /* unknown */ }
  return "";
}

export function cleanIp(raw) {
  let ip = String(raw || "").trim();
  if (ip.startsWith("[")) ip = ip.replace(/^\[|\]$/g, "");
  const pct = ip.indexOf("%");
  if (pct >= 0) ip = ip.slice(0, pct);
  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice(7);
  const colon = ip.lastIndexOf(":");
  if (colon >= 0 && ip.indexOf(":") === colon && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.slice(0, colon);
  return ip;
}

export function isLoopbackIp(ip) {
  const h = String(ip || "").split("%")[0].replace(/^\[|\]$/g, "").trim().toLowerCase();
  return h === "127.0.0.1" || h === "::1" || h === "::ffff:127.0.0.1" || h === "localhost" || h === "";
}

export function isPrivateIp(ip) {
  if (!ip) return true;
  if (isLoopbackIp(ip)) return true;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^127\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  const low = ip.toLowerCase();
  if (/^(fc|fd)/.test(low) || /^fe[89ab]/.test(low)) return true;
  return false;
}

/* Each rule: id, severity, test(targets) -> detail-string-or-null, hint.
   Targets: { method, pathname, search, ua, decoded } — all strings. */
const RULES = [
  {
    id: "WAF-009", severity: "medium", msg: "blocked HTTP method",
    hint: "Your server only needs GET/POST/HEAD/OPTIONS. If this was you, use a normal browser. If not, block the IP at the firewall.",
    test: (t) => (!ALLOW_METHODS.has(t.method) ? `method ${t.method}` : null),
  },
  {
    id: "WAF-010", severity: "medium", msg: "oversize URL",
    hint: "URLs over 4KB are never legitimate here — usually a fuzzer. Rate-limit or block the IP if it repeats.",
    test: (t) => (t.pathPlusQuery.length > 4096 ? `url ${t.pathPlusQuery.length} chars` : null),
  },
  {
    id: "WAF-011", severity: "high", msg: "null byte / control-character injection",
    hint: "Null bytes (%00) only appear in bypass attempts. Block the IP if it repeats; no admin action needed otherwise.",
    test: (t) => (/%00|%01|%02|%1f|\x00/.test(t.pathPlusQuery + " " + t.ua) ? "null/control byte" : null),
  },
  {
    id: "WAF-004", severity: "high", msg: "path traversal / local-file probing",
    hint: "Someone is trying ../ or encoded variants to read server files. If repeated from one IP, block it. Check data/uploads/ for unexpected files.",
    test: (t) => {
      const s = t.decoded;
      if (/\.\.[\/\\]/.test(s)) return "dot-dot-slash";
      if (/%2e%2e|%252e|%c0%af|%c1%9c/i.test(t.pathPlusQuery)) return "encoded traversal";
      if (/etc\/(passwd|shadow)/i.test(s)) return "etc/passwd probe";
      if (/\/(proc|sys)\//.test(s)) return "proc/sys probe";
      return null;
    },
  },
  {
    id: "WAF-006", severity: "high", msg: "local/remote file-include attempt",
    hint: "php://, file://, data: wrappers are never used by this site. Block the IP if it repeats.",
    test: (t) => (/php:\/\/|file:\/\/|data:text\/html|expect:\/\/|gopher:\/\/|dict:\/\//i.test(t.decoded) ? "file-wrapper scheme" : null),
  },
  {
    id: "WAF-001", severity: "high", msg: "SQL injection pattern",
    hint: "Classic SQLi text (union select, information_schema, or 1=1) in the URL. This site has no SQL — block the IP if it repeats.",
    test: (t) => {
      const s = t.decoded.toLowerCase();
      if (/union\s+(all\s+)?select/.test(s)) return "union select";
      if (/information_schema|pg_sleep|benchmark\s*\(|load_file\s*\(|into\s+outfile|into\s+dumpfile/.test(s)) return "sql keyword";
      if (/('|%27)\s*or\s+('|%27)?1('|%27)?\s*=\s*('|%27)?1/i.test(t.pathPlusQuery)) return "or 1=1";
      if (/('|%27)\s*;\s*(drop|delete|insert|update|select)\b/i.test(t.pathPlusQuery)) return "stacked query";
      return null;
    },
  },
  {
    id: "WAF-003", severity: "high", msg: "cross-site scripting pattern in URL",
    hint: "Someone put <script>, javascript: or an event handler (onerror=) in the URL. Visitors are safe (React escapes output) — block the IP if it repeats.",
    test: (t) => {
      const s = t.decoded.toLowerCase();
      if (/<\s*script/i.test(s)) return "<script>";
      if (/javascript\s*:/.test(s)) return "javascript: url";
      if (/on(error|load|click|mouseover|focus)\s*=/i.test(s)) return "event handler";
      if (/<\s*(iframe|object|embed|svg)[\s>]/i.test(s)) return "html tag";
      return null;
    },
  },
  {
    id: "WAF-005", severity: "critical", msg: "remote-code-execution pattern",
    hint: "CRITICAL: shell metacharacters aimed at the server (; rm, | sh, $(), curl|bash). If from an unknown IP, block it now, check running processes, and rotate the admin password after.",
    test: (t) => {
      const s = t.decoded;
      if (/;\s*(rm|wget|curl|chmod|chown|nc|bash|sh)\b/i.test(s)) return "shell command";
      if (/\|\s*(sh|bash)\b/i.test(s)) return "pipe to shell";
      if (/\$\(\s*(whoami|id|cat|ls|pwd)/i.test(s)) return "$() execution";
      if (/\$\{IFS\}/i.test(s)) return "${IFS} evasion";
      if (/`[^`]*`/.test(s) && /(whoami|id|cat|ls)\b/i.test(s)) return "backtick execution";
      if (/\/bin\/(sh|bash)/i.test(s)) return "/bin/sh";
      return null;
    },
  },
  {
    id: "WAF-007", severity: "medium", msg: "known scanner user-agent",
    hint: "Automated scanner (sqlmap/nikto/nmap/gobuster…). Harmless if blocked — block the IP if it keeps scanning.",
    test: (t) => (/sqlmap|nikto|masscan|nessus|dirbuster|gobuster|nmap|hydra|metasploit|burp|acunetix|openvas|zgrab|whatweb/i.test(t.ua) ? `ua ${t.ua.slice(0, 60)}` : null),
  },
  {
    id: "WAF-008", severity: "medium", msg: "sensitive-path probing",
    hint: "Probing for /.env, /.git, /wp-admin, backups (.bak/.sql). This site has none of those — block the IP if it repeats.",
    test: (t) => {
      const p = t.pathname.toLowerCase();
      if (/\/\.env(\.|$|\/)/.test(p)) return ".env";
      if (/\/\.git(\/|$)/.test(p)) return ".git";
      if (/wp-(admin|login|content)|phpmyadmin|pma\/|administrator\//.test(p)) return "cms probe";
      if (/\.(bak|sql|tgz|tar\.gz|old|swp)$/.test(p)) return "backup file probe";
      if (/\/actuator(\/|$)|\/\.aws\/|\/server-status/.test(p)) return "infra probe";
      return null;
    },
  },
  {
    id: "WAF-012", severity: "high", msg: "server-side-request-forgery pattern",
    hint: "A proxy-style URL pointing at localhost/cloud metadata (169.254.169.254). The /__yt door only allows YouTube — block the IP if it repeats.",
    test: (t) => {
      const s = t.decoded.toLowerCase();
      if (!/(^|[?&])(url|target|dest|redirect|next|u)=/.test(s)) return null;
      if (/169\.254\.169\.254|localhost|127\.0\.0\.1|10\.|192\.168\.|metadata\.google/.test(s)) return "ssrf target";
      return null;
    },
  },
];

export function inspectRequest({ method, url, headers, ip }) {
  const m = String(method || "GET").toUpperCase();
  const raw = String(url || "/");
  const q = raw.indexOf("?");
  const pathname = q >= 0 ? raw.slice(0, q) : raw;
  const search = q >= 0 ? raw.slice(q) : "";
  const ua = String((headers && (headers["user-agent"] || headers["User-Agent"])) || "");
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* keep raw */ }
  try { decoded = decodeURIComponent(decoded); } catch { /* single-decode only */ }
  const t = { method: m, pathname, search, pathPlusQuery: raw, ua, decoded };
  for (const r of RULES) {
    let detail = null;
    try { detail = r.test(t); } catch { detail = null; }
    if (detail) return { allow: false, rule: r.id, severity: r.severity, msg: r.msg, detail, hint: r.hint };
  }
  return { allow: true };
}

export function createWaf({ mode, onEvent } = {}) {
  const enforce = String(process.env.WAF_MODE || mode || "enforce").toLowerCase() !== "log-only";
  const hits = new Map(); // ip -> timestamps[]
  const blocked = new Map(); // ip -> unblockAt
  const stats = { inspected: 0, blocked: 0, byRule: {} };

  function isBlocked(ip) {
    if (!ip) return false;
    const until = blocked.get(ip);
    if (!until) return false;
    if (Date.now() > until) { blocked.delete(ip); return false; }
    return true;
  }

  function noteHit(ip) {
    const now = Date.now();
    let arr = hits.get(ip);
    if (!arr) { arr = []; hits.set(ip, arr); }
    arr.push(now);
    while (arr.length && now - arr[0] > 60000) arr.shift();
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return arr.length;
  }

  function check(req) {
    const ip = getClientIp(req) || "unknown";
    stats.inspected++;
    // Internal loops (live-follow, feed-follow, bake) must never break:
    // loopback is inspected but rate limits don't apply to it.
    const loopback = isLoopbackIp(ip);
    if (!loopback && isBlocked(ip)) {
      return { allow: false, blocked: true, rule: "WAF-BLOCKLIST", severity: "high", msg: "repeat-offender IP temporarily blocked", detail: `ip ${ip}`, hint: "Auto-expires in 5 minutes. Unblock sooner by restarting the server. If the same IP returns, block it at the host firewall." };
    }
    const v = inspectRequest({ method: req.method, url: req.url, headers: req.headers, ip });
    const rate = noteHit(ip);
    if (!loopback && rate > 300) {
      blocked.set(ip, Date.now() + 5 * 60 * 1000);
      const out = { allow: false, rule: "WAF-RATE", severity: "high", msg: "request flood", detail: `${rate} req/min from ${ip}`, hint: "Likely a scraper or flood. The IP is auto-blocked for 5 minutes. If it returns, rate-limit at the host (or put Cloudflare in front) and check the security log for what it asked for." };
      stats.blocked++; stats.byRule["WAF-RATE"] = (stats.byRule["WAF-RATE"] || 0) + 1;
      try { onEvent && onEvent({ source: "waf", ...out, ip }); } catch {}
      return enforce ? out : { allow: true, logged: out };
    }
    if (!loopback && rate > 120) {
      try { onEvent && onEvent({ source: "waf", rule: "WAF-RATE", severity: "low", msg: "elevated request rate", detail: `${rate} req/min from ${ip}`, hint: "Watch this IP — normal browsing is far below this. Block it if it keeps climbing.", ip }); } catch {}
    }
    if (!v.allow) {
      stats.blocked++; stats.byRule[v.rule] = (stats.byRule[v.rule] || 0) + 1;
      // Escalate repeat offenders onto the temporary blocklist.
      const key = ip + ":" + v.rule;
      const n = (check._rep?.get(key) || 0) + 1;
      if (!check._rep) check._rep = new Map();
      check._rep.set(key, n);
      if (!loopback && n >= 3) blocked.set(ip, Date.now() + 5 * 60 * 1000);
      try { onEvent && onEvent({ source: "waf", ...v, ip }); } catch {}
      if (!enforce) return { allow: true, logged: v };
      return { ...v, ip };
    }
    return { allow: true, ip };
  }

  return { check, isBlocked, stats, getClientIp, mode: enforce ? "enforce" : "log-only" };
}

/* Static build: the same patterns as a tiny browser guard (baked to
   dist/wom-waf.js). It never blocks navigation — it strips malicious query/hash
   payloads via history.replaceState and beacons to the office server when one is
   configured, so static hosts get filtering even with no server. */
export const STATIC_GUARD_SRC = `/* wom-waf.js — static-host guard (baked by build-static.mjs). Same rule spirit as
   scripts/waf.mjs, adapted for the browser: never blocks navigation, only
   neutralises malicious query/hash payloads before React boots. The maintenance
   gate below it is untouched. */
(function () {
  try {
    var href = String(window.location.href || "");
    var bad = /(%00|<\\s*script|javascript\\s*:|on(error|load|click|mouseover|focus)\\s*=|\\.\\.[\\/\\\\]|\\/etc\\/(passwd|shadow)|union\\s+(all\\s+)?select|information_schema|php:\\/\\/|\\/\\.env|\\/\\.git\\/|wp-admin|\\.bak([?&#]|$))/i;
    if (!bad.test(href)) return;
    try {
      var u = new URL(href);
      var changed = false;
      [["search", u.searchParams], ["hash", null]].forEach(function () {});
      // Scrub query params carrying payloads; keep the page itself.
      try {
        var names = [];
        u.searchParams.forEach(function (_, k) { names.push(k); });
        names.forEach(function (k) {
          var v = u.searchParams.get(k) || "";
          if (bad.test(v)) { u.searchParams.set(k, "[blocked]"); changed = true; }
        });
      } catch (_) {}
      var h = String(u.hash || "");
      if (bad.test(h)) { try { u.hash = ""; changed = true; } catch (_) {} }
      if (changed) {
        try { window.history.replaceState(null, "", u.toString()); } catch (_) {}
        try { console.warn("[waf] static guard neutralised a malicious URL pattern"); } catch (_) {}
        // Best-effort beacon to the office server (present on server-backed copies).
        try {
          var meta = document.querySelector('meta[name="wom-server"]');
          var origin = meta ? (meta.getAttribute("content") || "") : "";
          if (origin && /^https?:\\/\\/[^/\\s]+$/i.test(origin)) {
            fetch(origin + "/__security-beacon", { method: "POST", mode: "cors", cache: "no-store", headers: { "content-type": "text/plain" }, body: JSON.stringify({ rule: "WAF-STATIC", href: href.slice(0, 500) }) }).catch(function () {});
          }
        } catch (_) {}
      }
    } catch (_) {}
  } catch (_) {}
})();
`;
