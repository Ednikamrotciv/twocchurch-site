// waf.mjs — ModSecurity-style shield that sits in FRONT of the entire code.
// Zero dependencies, synchronous regex only (microseconds per request), so
// frontend + backend deploys stay fast. Two layers, as requested:
//
//   STATIC  — signature checks on method / path / query / SSRF target that need
//             no session state (SQLi, XSS, command injection, path traversal,
//             sensitive-file probing, oversized URLs).
//   CONTEXT — session-aware checks: tiered per-IP rate limits (status reads,
//             general API, auth doors, password recovery, publishing), and body
//             inspection for sensitive RPCs. Legitimate admin HTML
//             (publish/adopt bodies carry real page markup) is never scanned,
//             so Publish / Recover / live-relay keep working.
//
// Dev vs prod: the SAME module runs in both `npm run dev`
// (scripts/vite-cms-backend.mjs) and production (scripts/serve.mjs, including
// on Render). Every check executes server-side in Node — nothing here trusts
// the browser, so editing frontend JavaScript cannot bypass it. Vite
// development paths (/@vite/*, /@react-refresh, HMR file serving) are
// recognized as dev-only noise and are NEVER rate-counted, while attack
// signatures are still scanned on every path in both modes.
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

// RPCs whose POST body legitimately contains full page HTML — never signature-scanned.
const HTML_BODY_RPCS = new Set(["publish", "adoptLive", "adoptFeed", "getContent"]);
// Credential doors get their own strict context buckets (see RATE below).
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
  "mainState",
  "listSubs",
  "createInvite",
  "revokeInvite",
  "deleteSub",
]);

// ---------------------------------------------------------------------------
// IP helpers — loopback/IPv4/IPv6 handled in one place, spoof-safe.
// Forwarded headers are ONLY honored when the direct remote is a trusted
// proxy (explicit TRUST_PROXY=1, Render's router, or a loopback/private net
// the operator controls). A public remote can never smuggle an X-Forwarded-For
// past this: without trust the socket address is the client, full stop.
// When trusting a proxy, the LAST entry is used (a proxy appends the address
// it actually saw; the first entry is client-controlled).
// ---------------------------------------------------------------------------
const RE_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function normalizeIp(ip) {
  let s = String(ip == null ? "" : ip).trim();
  if (!s) return "-";
  s = s.split("%")[0]; // IPv6 zone id (%lo0, %eth0)
  s = s.replace(/^\[|\]$/g, "").trim().toLowerCase();
  if (s.startsWith("::ffff:")) {
    const v4 = s.slice(7);
    if (RE_IPV4.test(v4)) return v4;
  }
  if (s === "::1") return "127.0.0.1";
  if (s === "localhost") return "127.0.0.1";
  return s.slice(0, 64) || "-";
}

export function isLoopbackIp(ip) {
  const s = normalizeIp(ip);
  return s === "127.0.0.1" || s.startsWith("127.") || s === "localhost";
}

function ipv4Parts(s) {
  const m = RE_IPV4.exec(s);
  if (!m) return null;
  const p = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (p.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return p;
}

export function isPrivateIp(ip) {
  const s = normalizeIp(ip);
  if (isLoopbackIp(s)) return true;
  const p = ipv4Parts(s);
  if (p) {
    if (p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    return false;
  }
  const low = s.toLowerCase();
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique-local
  if (low.startsWith("fe80:")) return true; // link-local
  return false;
}

// 'loopback' | 'private' | 'public' | 'unknown'
export function ipClass(ip) {
  const s = normalizeIp(ip);
  if (!s || s === "-") return "unknown";
  if (isLoopbackIp(s)) return "loopback";
  if (isPrivateIp(s)) return "private";
  if (RE_IPV4.test(s) || s.includes(":")) return "public";
  return "unknown";
}

function validForwardedEntry(s) {
  const t = String(s || "").trim().replace(/^\[|\]$/g, "");
  if (!t || t.length > 64) return "";
  if (RE_IPV4.test(t)) {
    const p = ipv4Parts(t);
    if (!p) return "";
    return t;
  }
  // IPv6: hex + colons (+ optional zone, stripped by normalizeIp later).
  if (/^[0-9a-fA-F:.]{3,64}$/.test(t) && t.includes(":")) return t;
  return "";
}

// The ONE place client IPs are derived. trustProxy must be true only when a
// proxy the operator controls terminates the connection (Render's router,
// TRUST_PROXY=1, or a loopback/private remote in dev).
export function getClientIp(req, trustProxy = false) {
  let remote = "-";
  try {
    remote = normalizeIp(req && req.socket && req.socket.remoteAddress);
  } catch {
    remote = "-";
  }
  try {
    const directTrusted = !!trustProxy || isLoopbackIp(remote) || isPrivateIp(remote);
    if (directTrusted && req && req.headers) {
      const raw = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "";
      const parts = String(raw).split(",");
      // Last entry = address the trusted proxy actually saw. Earlier entries
      // are client-controlled and must never be trusted.
      for (let i = parts.length - 1; i >= 0; i--) {
        const cand = validForwardedEntry(parts[i]);
        if (cand) return normalizeIp(cand);
      }
    }
  } catch {
    /* fall through to the socket address */
  }
  return remote || "-";
}

// ---------------------------------------------------------------------------
// Endpoint classification. Harmless dev/static/status traffic is recognized so
// it is NEVER rate-counted (a Vite save storm must not read as an attack),
// while high-frequency status READS (contentRev/getContent polls) ride a
// generous dedicated bucket instead of the strict API one — three open tabs
// stay far under it, but a scraper still meets a limit. Every signature scan
// still runs on every path.
// ---------------------------------------------------------------------------
const STATUS_EXACT = new Set([
  "/version.json",
  "/seed.json",
  "/server.json",
  "/feed.json",
  "/__live-url",
  "/scripts/local-shim.js",
  "/__cms/health",
  "/__health",
]);
const STATUS_SSE = new Set(["/__cms/events"]);

function isViteDevPath(p) {
  return (
    p === "/@react-refresh" ||
    p === "/@vite/client" ||
    p.startsWith("/@vite/") ||
    p.startsWith("/@fs/") ||
    p.startsWith("/@id/") ||
    p.startsWith("/node_modules/") ||
    p.startsWith("/src/") ||
    p.startsWith("/scripts/")
  );
}

const SAFE_EXT = /\.(js|mjs|cjs|css|map|png|jpg|jpeg|webp|gif|avif|svg|ico|woff2?|ttf|otf|mp3|mp4|webm|mov|m4v|ogv|ogg|oga|opus|wav|m4a|aac|flac|mid|midi|txt|webmanifest)$/i;

const AUTH_LOGIN_RPCS = new Set(["login", "login2fa"]);
const RECOVERY_RPCS = new Set(["setSubPassword"]);
const PUBLISH_RPCS = new Set(["publish", "undoPublish", "adoptLive", "adoptFeed"]);
const STATUS_READ_RPCS = new Set(["contentRev", "getContent", "checkAdmin", "liveReport", "health"]);

// Category names are logged with every security event (endpoint categories).
export function endpointCategory(pathname, method = "GET") {
  const p = String(pathname || "/");
  const m = String(method || "GET").toUpperCase();
  if (isViteDevPath(p)) return "dev-hmr";
  if (p === "/__cms/events" && m === "GET") return "status-sse";
  if (STATUS_EXACT.has(p) && m === "GET") return "status";
  if (p === "/__security/events.json" || p === "/__security/report.pdf") return "security";
  if ((p === "/__upload" || p === "/__restore-file" || p === "/__delete-file") && m === "POST") return "upload";
  if (p.startsWith("/__cms/") && m === "POST") {
    const rpc = p.slice("/__cms/".length);
    if (AUTH_LOGIN_RPCS.has(rpc)) return "api-auth";
    if (RECOVERY_RPCS.has(rpc)) return "api-recovery";
    if (PUBLISH_RPCS.has(rpc)) return "api-publish";
    if (STATUS_READ_RPCS.has(rpc)) return "status-read";
    return "api";
  }
  if (p.startsWith("/__yt") || p.startsWith("/__geo") || p.startsWith("/__rates")) return "api";
  if (p.startsWith("/data/uploads/") || p.startsWith("/src/assets/")) return "static";
  if (SAFE_EXT.test(p)) return "static";
  return "other";
}

// Paths whose hits never touch a rate counter. Signature scans still apply.
// NOTE: status-read RPCs (contentRev/getContent/...) are deliberately NOT in
// this list — they ride the generous `status` bucket (180/min, 15s throttle)
// so a runaway scraper still meets a limit while normal polling never does.
// Truly harmless doors (version.json, __live-url, Vite HMR, static assets,
// the SSE stream) are fully exempt.
export function isSafePath(pathname, method = "GET") {
  const c = endpointCategory(pathname, method);
  return c === "dev-hmr" || c === "static" || c === "status" || c === "status-sse";
}

// Per-bucket rate policy (documented in scripts/SECURITY.md — the numbers
// below ARE the production policy; changing them changes prod behavior):
//   status   — harmless reads every tab polls (contentRev, version.json,
//              __live-url, static assets are exempt entirely): generous.
//   api      — general authenticated/anonymous RPCs: comfortable for office use.
//   auth     — password/2FA guessing pace: strict, 5-minute throttle.
//   recovery — invite-code redemption (one credential, rarely used): strictest.
//   publish  — publishes are heavyweight and human-paced: strict count.
export const RATE_LIMITS = {
  status: { windowMs: 60 * 1000, max: 180, blockMs: 15 * 1000, severity: "low" },
  api: { windowMs: 60 * 1000, max: 90, blockMs: 30 * 1000, severity: "low" },
  auth: { windowMs: 60 * 1000, max: 20, blockMs: 5 * 60 * 1000, severity: "medium" },
  recovery: { windowMs: 60 * 1000, max: 10, blockMs: 5 * 60 * 1000, severity: "medium" },
  publish: { windowMs: 60 * 1000, max: 20, blockMs: 60 * 1000, severity: "low" },
};

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
  // context state (in-memory only; a restart resets counters — safe fail-open).
  // NOTE: in-memory by design. Render runs a single instance by default, so a
  // per-process bucket is exact there; if the service is ever scaled
  // horizontally, add sticky sessions or a shared store (see SECURITY.md).
  const buckets = new Map(); // bucketName -> Map(ip -> { n, windowStart, blockedUntil })

  function bucketFor(name) {
    let b = buckets.get(name);
    if (!b) {
      b = new Map();
      buckets.set(name, b);
    }
    return b;
  }

  function rateHit(name, ip, now) {
    const cfg = RATE_LIMITS[name] || RATE_LIMITS.api;
    const map = bucketFor(name);
    let e = map.get(ip);
    if (!e || now - e.windowStart > cfg.windowMs) {
      e = { n: 0, windowStart: now, blockedUntil: 0 };
      map.set(ip, e);
      if (map.size > 5000) map.clear();
    }
    if (e.blockedUntil && now < e.blockedUntil) {
      return { limited: true, fresh: false, retryAfter: Math.ceil((e.blockedUntil - now) / 1000) };
    }
    e.n += 1;
    if (e.n > cfg.max) {
      e.blockedUntil = now + cfg.blockMs;
      return { limited: true, fresh: true, retryAfter: Math.ceil(cfg.blockMs / 1000) };
    }
    return { limited: false };
  }

  function rateVerdict(name, ip, now) {
    const cfg = RATE_LIMITS[name] || RATE_LIMITS.api;
    const r = rateHit(name, ip, now);
    if (!r.limited) return null;
    const what =
      name === "status"
        ? "status-read rate"
        : name === "auth"
          ? "auth-door rate"
          : name === "recovery"
            ? "password-recovery rate"
            : name === "publish"
              ? "publish rate"
              : "API rate";
    if (r.fresh) {
      return {
        allow: false,
        status: 429,
        continuation: false,
        bucket: name,
        reason: `${what} exceeded (>${cfg.max} req/min — throttled ${Math.round(cfg.blockMs / 1000)}s)`,
        severity: cfg.severity,
        retryAfter: r.retryAfter,
        hint:
          name === "auth" || name === "recovery"
            ? "password-guessing pace from one IP. Server-side per-connection limits also apply — consider blocking the IP at the host firewall if it continues."
            : name === "publish"
              ? "publishes are human-paced; a burst here is a stuck retry loop, not an office click. Throttle lifts by itself."
              : "burst traffic from one IP — usually a scraper or a stuck tab. Throttle lifts by itself; block at the host firewall only if it persists.",
      };
    }
    // Continuation inside one throttle window: the SAME incident, not a new
    // breach. Callers log this at info level and never count it toward PDFs.
    return {
      allow: false,
      status: 429,
      continuation: true,
      bucket: name,
      reason: `IP throttled (${what}, retry in ${r.retryAfter}s)`,
      severity: "info",
      retryAfter: r.retryAfter,
      hint: "repeat inside an active throttle window — counted with the original incident, not as a new breach.",
    };
  }

  function checkRequest({ method = "GET", pathname = "/", search = "", headers = {}, ip = "-" } = {}) {
    const m = String(method || "GET").toUpperCase();
    const path = String(pathname || "/");
    const query = String(search || "");
    const full = path + query;
    const client = normalizeIp(ip);
    const category = endpointCategory(path, m);
    // 1) method allow-list
    if (!ALLOW_METHODS.has(m)) {
      return {
        allow: false,
        status: 403,
        continuation: false,
        category,
        reason: `blocked method ${m}`,
        severity: "medium",
        hint: "method allow-list is GET/POST/OPTIONS/HEAD; if a legit client needs more, extend ALLOW_METHODS in scripts/waf.mjs.",
      };
    }
    // 2) oversized URL (slowloris / buffer-probe)
    if (full.length > 4096) {
      return {
        allow: false,
        status: 403,
        continuation: false,
        category,
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
        status: 403,
        continuation: false,
        category,
        reason: "path traversal pattern",
        severity: "high",
        hint: "someone probed for ../ or encoded dots. Static files are already jailed by path.normalize checks — keep them. If repeats from one IP, block it at the host firewall.",
      };
    }
    // 4) sensitive-file probing (state, version, git, env)
    if (RE_SENSITIVE.test(path) || RE_SENSITIVE.test(decoded)) {
      return {
        allow: false,
        status: 403,
        continuation: false,
        category,
        reason: "sensitive-file probe",
        severity: "high",
        hint: "someone asked for a secret-bearing file (git/env/state). data/cms-state.bin is never served — keep it that way. Rate-limit will throttle repeats.",
      };
    }
    // 5) static signatures on the URL/query (GET-safe: no legit query contains these)
    if (RE_SQLI.test(decoded)) {
      return {
        allow: false,
        status: 403,
        continuation: false,
        category,
        reason: "SQL-injection pattern in URL",
        severity: "high",
        hint: "the backend uses a binary blob store (no SQL), so injection cannot land — but the prober will try other doors. Watch for repeats from this IP.",
      };
    }
    if (RE_XSS.test(decoded)) {
      return {
        allow: false,
        status: 403,
        continuation: false,
        category,
        reason: "XSS pattern in URL",
        severity: "high",
        hint: "reflected-XSS probe blocked before the server. Stored uploads already refuse SVG/HTML and serve with a sandbox CSP — keep those guards.",
      };
    }
    if (RE_CMDI.test(decoded)) {
      return {
        allow: false,
        status: 403,
        continuation: false,
        category,
        reason: "command-injection pattern in URL",
        severity: "critical",
        hint: "treat as targeted: block this IP at the host firewall, rotate the admin password, and check data/uploads/ for unexpected files.",
      };
    }
    if (RE_LFI.test(decoded)) {
      return {
        allow: false,
        status: 403,
        continuation: false,
        category,
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
            status: 403,
            continuation: false,
            category,
            reason: "SSRF-blocked __yt target (non-YouTube host)",
            severity: "high",
            hint: "the __yt proxy only fetches YouTube. Someone tried to make the server fetch elsewhere — blocked. No action unless repeats.",
          };
        }
      } catch {
        return {
          allow: false,
          status: 400,
          continuation: false,
          category,
          reason: "malformed __yt target",
          severity: "low",
          hint: "bad __yt url — likely a broken link, not an attack.",
        };
      }
    }
    // 7) context: harmless traffic is never rate-counted (dev HMR storms,
    //    content-revision polls, version checks, static assets). Publish RPCs
    //    are counted once in checkBody instead of here (their POST carries the
    //    whole site — one count per publish, not two).
    if (isSafePath(path, m)) {
      return { allow: true, category };
    }
    if (category === "api-publish") {
      return { allow: true, category };
    }
    // 8) context: tiered per-IP rate buckets.
    const now = Date.now();
    const bucket = category === "api-auth" ? "auth" : category === "api-recovery" ? "recovery" : category === "status-read" ? "status" : m === "GET" ? "status" : "api";
    const v = rateVerdict(bucket, client, now);
    if (v) {
      v.category = category;
      return v;
    }
    void headers;
    return { allow: true, category };
  }

  function checkBody({ rpc = "", body = "", ip = "-" } = {}) {
    const name = String(rpc || "");
    const text = typeof body === "string" ? body : "";
    const client = normalizeIp(ip);
    const category = name
      ? endpointCategory("/__cms/" + name, "POST")
      : "api";
    if (!text) {
      // Empty-body publishes are still publishes: count them once here.
      if (PUBLISH_RPCS.has(name)) {
        const v = rateVerdict("publish", client, Date.now());
        if (v) {
          v.category = category;
          return v;
        }
      }
      return { allow: true, category };
    }
    // publish-family bodies ARE the site content — never signature-scanned,
    // but publishes ARE rate-counted here (once per publish).
    if (HTML_BODY_RPCS.has(name)) {
      if (text.length > 8 * 1024 * 1024) {
        return {
          allow: false,
          status: 413,
          continuation: false,
          category,
          reason: `oversized ${name} body`,
          severity: "medium",
          hint: "publish bodies over 8MB are refused — split the publish or shrink uploads.",
        };
      }
      if (PUBLISH_RPCS.has(name)) {
        const v = rateVerdict("publish", client, Date.now());
        if (v) {
          v.category = category;
          return v;
        }
      }
      return { allow: true, category };
    }
    // Credential doors are compared as hashes server-side (injection cannot
    // land there), and human-chosen passwords may contain odd strings — never
    // block a sign-in on a signature. Per-IP auth/recovery buckets still apply
    // (checkRequest counted the door), and failures are still logged by the
    // anomaly detector.
    if (AUTH_RPCS.has(name)) return { allow: true, category };
    if (text.length > 256 * 1024) {
      return {
        allow: false,
        status: 413,
        continuation: false,
        category,
        reason: `oversized ${name || "request"} body`,
        severity: "medium",
        hint: "non-content RPCs never need >256KB — likely a fuzz. No action unless office tooling hits it.",
      };
    }
    const sample = safeDecode(text.slice(0, 20000));
    if (RE_SQLI.test(sample) || RE_CMDI.test(sample) || RE_LFI.test(sample)) {
      return {
        allow: false,
        status: 403,
        continuation: false,
        category,
        reason: `injection pattern in ${name || "request"} body`,
        severity: "high",
        hint: "malicious payload blocked before the server. Check whether the same IP probed other doors.",
      };
    }
    if (RE_XSS.test(sample) && (name === "liveReport" || name === "createInvite")) {
      return {
        allow: false,
        status: 403,
        continuation: false,
        category,
        reason: `XSS pattern in ${name} body`,
        severity: "high",
        hint: "script markup in a field that never needs HTML — blocked. Publish content is unaffected (it is allow-listed separately).",
      };
    }
    return { allow: true, category };
  }

  return { checkRequest, checkBody };
}
