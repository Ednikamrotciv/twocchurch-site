// waf.mjs — ModSecurity-style shield that sits in FRONT of the entire code.
// Zero dependencies, synchronous regex only (microseconds per request), so
// frontend + backend deploys stay fast. Two layers, as requested:
//
//   STATIC  — signature checks on method / path / query / SSRF target that need
//             no session state (SQLi, XSS, command injection, path traversal,
//             sensitive-file probing, oversized URLs).
//   CONTEXT — session-aware checks: per-IP rate limits, stricter auth-door
//             limits, and body inspection for sensitive RPCs. Legitimate admin
//             HTML (publish/adopt bodies carry real page markup) is never
//             scanned, so Publish / Recover / live-relay keep working.
//
// Anything blocked is logged by the caller via security-log with severity,
// IP, route and a hardening hint. This module never does I/O itself.
const ALLOW_METHODS = new Set(["GET", "POST", "OPTIONS", "HEAD"]);

// --- static signatures (compiled once) ---
const RE_TRAVERSAL = /(?:\.\.(?:\/|\\|%2f|%5c|%252f|%255c)|%2e%2e|%252e|%c0%ae|%00|%0d|%0a|\\\.\.\/|__proto__)/i;
const RE_SENSITIVE = /(^|\/)(\.git)(\/|$)|(^|\/)(\.env)(\/|$)|(^|\/)data\/cms-state\.bin($|\?)|(^|\/)data\/cms-version\.txt($|\?)|(^|\/)cms-server\.txt($|\?)/i;
const RE_SQLI =
  /(\bunion\b.{0,24}\bselect\b|\bselect\b.{0,24}\bfrom\b.{0,24}\bwhere\b|'\s*or\s+'?1'?=?'?1|"\s*or\s+"?1"?=?\"?1|;\s*drop\s+table\b|\bdrop\s+table\b|\binsert\s+into\b\s*\w+|\bdelete\s+from\b\s*\w+|\bexec\s*\(\s*@|\bwaitfor\s+delay\b|\binformation_schema\b)/i;
const RE_XSS = /(<\s*script\b|<\s*iframe\b|<\s*object\b|<\s*embed\b|<\s*svg\b[^>]*onload|javascript\s*:|data\s*:\s*text\/html|onerror\s*=|onload\s*=|%3c\s*script)/i;
const RE_CMDI =
  /(;\s*(cat|ls|rm|wget|curl|bash|sh|powershell|nc|ncat)\b|\|\s*(cat|ls|rm|wget|curl|bash|sh)\b|`[^`]{1,80}`|\$\([^)]{1,80}\)|&&\s*(cat|ls|rm|wget|curl|bash)\b|%60[^%]{1,80}%60|%24%28)/i;
const RE_LFI = /(etc\/passwd|proc\/self| Lawson|\.ssh\/authorized_keys|c:\\windows\\system32)/i;

const YT_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"]);

// RPCs whose POST body legitimately contains full page HTML — never signature-scan.
const HTML_BODY_RPCS = new Set(["publish", "adoptLive", "adoptFeed", "getContent"]);
// Auth / credential doors get the strictest context limits.
const AUTH_RPCS = new Set(["login", "login2fa", "setSubPassword"]);
// Admin-only RPCs (privilege-escalation watch in session-anomaly.mjs).
export const PRIVILEGED_RPCS = new Set([
  "publish",
  "undoPublish",
  "clearLog",
  "liveReport",
  "totpSetup",
  "totpDisable",
  "setSecurityQA",
  "totpOffNow",
  "setMainPassword",
  "setMainOff",
  "mainState",
  "listSubs",
  "createInvite",
  "revokeInvite",
  "deleteSub",
]);

function safeDecode(s) {
  try {
    let out = String(s || "");
    for (let i = 0; i < 2; i++) {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    }
    return out;
  } catch {
    return String(s || "");
  }
}

export function createWaf() {
  // context state (in-memory only; a restart resets counters — safe fail-open)
  const ipHits = new Map(); // ip -> { n, windowStart, blockedUntil }
  const ipAuthHits = new Map(); // ip -> { n, windowStart }

  function rateHit(map, ip, now, windowMs, max, blockMs) {
    let e = map.get(ip);
    if (!e || now - e.windowStart > windowMs) {
      e = { n: 0, windowStart: now, blockedUntil: 0 };
      map.set(ip, e);
      if (map.size > 5000) map.clear();
    }
    if (e.blockedUntil && now < e.blockedUntil) return { limited: true, retryAfter: Math.ceil((e.blockedUntil - now) / 1000) };
    e.n += 1;
    if (e.n > max) {
      e.blockedUntil = now + blockMs;
      return { limited: true, retryAfter: Math.ceil(blockMs / 1000), fresh: true };
    }
    return { limited: false };
  }

  function checkRequest({ method = "GET", pathname = "/", search = "", headers = {}, ip = "-" } = {}) {
    const m = String(method || "GET").toUpperCase();
    const path = String(pathname || "/");
    const query = String(search || "");
    const full = path + query;
    // 1) method allow-list
    if (!ALLOW_METHODS.has(m)) {
      return {
        allow: false,
        reason: `blocked method ${m}`,
        severity: "medium",
        hint: "method allow-list is GET/POST/OPTIONS/HEAD; if a legit client needs more, extend ALLOW_METHODS in scripts/waf.mjs.",
      };
    }
    // 2) oversized URL (slowloris / buffer-probe)
    if (full.length > 4096) {
      return {
        allow: false,
        reason: `oversized URL (${full.length} chars)`,
        severity: "medium",
        hint: "URLs over 4KB are never legit here — likely a fuzzer. No action needed unless office tooling builds long URLs.",
      };
    }
    const decoded = safeDecode(full);
    // 3) path traversal / null-byte / proto-pollution
    if (RE_TRAVERSAL.test(full) || RE_TRAVERSAL.test(decoded) || decoded.includes("..")) {
      return {
        allow: false,
        reason: "path traversal pattern",
        severity: "high",
        hint: "someone probed for ../ or encoded dots. Static files are already jailed by path.normalize checks — keep them. If repeats from one IP, block it at the host firewall.",
      };
    }
    // 4) sensitive-file probing (state, version, git, env)
    if (RE_SENSITIVE.test(path) || RE_SENSITIVE.test(decoded)) {
      return {
        allow: false,
        reason: "sensitive-file probe",
        severity: "high",
        hint: "someone asked for a secret-bearing file (git/env/state). data/cms-state.bin is never served — keep it that way. Rate-limit will throttle repeats.",
      };
    }
    // 5) static signatures on the URL/query (GET-safe: no legit query contains these)
    if (RE_SQLI.test(decoded)) {
      return {
        allow: false,
        reason: "SQL-injection pattern in URL",
        severity: "high",
        hint: "the backend uses a binary blob store (no SQL), so injection cannot land — but the prober will try other doors. Watch for repeats from this IP.",
      };
    }
    if (RE_XSS.test(decoded)) {
      return {
        allow: false,
        reason: "XSS pattern in URL",
        severity: "high",
        hint: "reflected-XSS probe blocked before the server. Stored uploads already refuse SVG/HTML and serve with a sandbox CSP — keep those guards.",
      };
    }
    if (RE_CMDI.test(decoded)) {
      return {
        allow: false,
        reason: "command-injection pattern in URL",
        severity: "critical",
        hint: "treat as targeted: block this IP at the host firewall, rotate the admin password, and check data/uploads/ for unexpected files.",
      };
    }
    if (RE_LFI.test(decoded)) {
      return {
        allow: false,
        reason: "local-file-inclusion pattern in URL",
        severity: "high",
        hint: "LFI probe blocked. Static serving is jailed to dist/ (+uploads) — keep the path.normalize guards in serve.mjs.",
      };
    }
    // 6) SSRF double-check on the YouTube proxy door
    if (path === "/__yt") {
      try {
        const q = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
        const target = q.get("url") || "";
        const host = new URL(target).hostname.toLowerCase();
        if (!YT_HOSTS.has(host)) {
          return {
            allow: false,
            reason: "SSRF-blocked __yt target (non-YouTube host)",
            severity: "high",
            hint: "the __yt proxy only fetches YouTube. Someone tried to make the server fetch elsewhere — blocked. No action unless repeats.",
          };
        }
      } catch {
        return { allow: false, reason: "malformed __yt target", severity: "low", hint: "bad __yt url — likely a broken link, not an attack." };
      }
    }
    // 7) context: per-IP rate (all routes)
    const now = Date.now();
    const rl = rateHit(ipHits, ip, now, 60 * 1000, 150, 60 * 1000);
    if (rl.limited) {
      return {
        allow: false,
        reason: rl.fresh ? "IP rate limit exceeded (>150 req/min — throttled 60s)" : `IP throttled (retry in ${rl.retryAfter}s)`,
        severity: "medium",
        hint: "burst traffic from one IP — usually a scraper or a stuck tab. Throttle lifts by itself; block at the host firewall only if it persists.",
      };
    }
    // 8) context: stricter auth-door rate
    if (path.startsWith("/__cms/login") || path.startsWith("/__cms/setSubPassword")) {
      const ar = rateHit(ipAuthHits, ip, now, 60 * 1000, 20, 5 * 60 * 1000);
      if (ar.limited) {
        return {
          allow: false,
          reason: "auth-door rate limit exceeded (>20 tries/min — throttled 5 min)",
          severity: "high",
          hint: "password-guessing pace from one IP. Server-side per-connection limits also apply — consider blocking the IP at the host firewall if it continues.",
        };
      }
    }
    void headers;
    return { allow: true };
  }

  function checkBody({ rpc = "", body = "", ip = "-" } = {}) {
    const name = String(rpc || "");
    const text = typeof body === "string" ? body : "";
    if (!text) return { allow: true };
    // publish-family bodies ARE the site content — never signature-scan.
    if (HTML_BODY_RPCS.has(name)) {
      if (text.length > 8 * 1024 * 1024) {
        return { allow: false, reason: `oversized ${name} body`, severity: "medium", hint: "publish bodies over 8MB are refused — split the publish or shrink uploads." };
      }
      return { allow: true };
    }
    if (text.length > 256 * 1024) {
      return { allow: false, reason: `oversized ${name || "request"} body`, severity: "medium", hint: "non-content RPCs never need >256KB — likely a fuzz. No action unless office tooling hits it." };
    }
    const sample = safeDecode(text.slice(0, 20000));
    if (AUTH_RPCS.has(name)) {
      // credential doors: injection strings in a password field are attacks, not typos
      if (RE_SQLI.test(sample) || RE_CMDI.test(sample)) {
        return {
          allow: false,
          reason: `injection pattern in ${name} credential`,
          severity: "high",
          hint: "injection string used as a password/2FA code — classic auth-bypass probe. Server compares hashes only, so it cannot land; watch the IP.",
        };
      }
      return { allow: true };
    }
    if (RE_SQLI.test(sample) || RE_CMDI.test(sample) || RE_LFI.test(sample)) {
      return {
        allow: false,
        reason: `injection pattern in ${name || "request"} body`,
        severity: "high",
        hint: "malicious payload blocked before the server. Check whether the same IP probed other doors.",
      };
    }
    if (RE_XSS.test(sample) && (name === "liveReport" || name === "createInvite")) {
      return {
        allow: false,
        reason: `XSS pattern in ${name} body`,
        severity: "high",
        hint: "script markup in a field that never needs HTML — blocked. Publish content is unaffected (it is allow-listed separately).",
      };
    }
    void ip;
    return { allow: true };
  }

  return { checkRequest, checkBody };
}
