/* ============================================================================
   WAF + session anomaly detection (mod-security style).

   Sits in FRONT of the entire Node server (scripts/serve.mjs for production,
   scripts/vite-cms-backend.mjs for `npm run dev`): every request — static
   files, admin RPC, uploads, geo/YouTube proxies — passes inspect() before
   any routing, and every admin-RPC call passes rpcGuard() before the content
   server ever sees it. Nothing here changes what a legitimate visitor or the
   office can do; it only rejects traffic that matches malicious patterns and
   flags sessions that behave unlike their owner.

   Two halves, one process-local store:

   STATIC (signature) half — pattern matching over the request line:
     * HTTP method allowlist, URL length caps, path normalization.
     * Encoded/double-encoded traversal, null bytes, probe paths
       (/.git/, /.env, wp-admin, phpMyAdmin, ...), scriptable extensions.
     * High-confidence attack signatures: SQL injection, cross-site
       scripting, command injection, template injection, XXE/LDAP/JNDI,
       SSI, known scanner user-agents.
     * Per-IP / per-route rate limits with 429 + Retry-After.

   CONTEXT (session anomaly) half — behavior over time, in real time:
     * Impossible travel: an authenticated admin connection (conn id) seen
       from two COUNTRIES within minutes (geo-confirmed via the geo proxy)
       is quarantined: reads and login still work, but write RPC is refused
       until the office signs in again (which clears the quarantine). Plain
       IP switches in the same country only flag, never block. Visitors are
       never quarantined — only admin sessions caught hopping countries.
     * Unusual data-access volume: per-IP and per-connection sliding windows
       over requests, RPC calls and bytes read; bursts past the caps are
       throttled (429) and logged.
     * Privilege escalation: unauthenticated calls to admin-write RPC,
       repeated denied writes, role-grant fields smuggled in request bodies
       ("role":"admin", isAdmin, ...), and prototype-pollution keys
       (__proto__, constructor/prototype) are denied, counted, and after a
       few attempts earn the IP a temporary block.

   Loopback (the office machine itself) is never auto-blocked — it is still
   signature-scanned and still logged, so a compromised local process cannot
   silently exploit the server either.

   Pure logic, zero dependencies, injectable clock (opts.now) so the rules
   are unit-testable without the network.
   ========================================================================== */

const DEFAULTS = {
  /* Request line caps. */
  maxUrlLen: 8192,
  maxQueryLen: 4096,
  maxHeaderLen: 8192,
  /* Sliding rate windows (per key): [maxHits, windowMs, blockMs]. */
  globalPerIp: [600, 60 * 1000, 60 * 1000],
  apiPerIp: [180, 60 * 1000, 120 * 1000],
  uploadPerIp: [12, 60 * 1000, 300 * 1000],
  proxyPerIp: [60, 60 * 1000, 120 * 1000],
  authPerIp: [30, 60 * 1000, 300 * 1000],
  rpcPerConn: [240, 60 * 1000, 120 * 1000],
  readBurstPerConn: [120, 60 * 1000, 0],
  /* Session anomaly: IP switches only flag (see bindConn); only a
     geo-confirmed country hop quarantines (see noteGeo). */
  travelWindowMs: 10 * 60 * 1000,
  travelIpsBeforeFlag: 2,
  quarantineMs: 30 * 60 * 1000,
  deniedWritesBeforeBlock: 3,
  deniedWriteWindowMs: 10 * 60 * 1000,
  ipBlockMs: 30 * 60 * 1000,
  /* Body scan caps (bytes actually inspected — linear scan, bounded). */
  scanBodyBytes: 256 * 1024,
  maxEvents: 200,
};

/* Admin-write RPC: anything here without a live admin session is a
   privilege-escalation probe by definition. adoptLive/adoptFeed carry their
   own unguessable per-boot token (checked in cms-server.js); a wrong token
   is still counted as a probe. Reads (getContent, contentRev, checkAdmin,
   totpStatus, mainState, listSubs) are public by design and never count. */
export const WRITE_METHODS = new Set([
  "publish",
  "undoPublish",
  "adoptLive",
  "adoptFeed",
  "totpSetup",
  "setSecurityQA",
  "totpDisable",
  "totpOffNow",
  "setMainOff",
  "setMainPassword",
  "createInvite",
  "revokeInvite",
  "deleteSub",
  "clearLog",
  "liveReport",
  "setSubPassword",
  "login2fa",
]);

/* Auth-doors get their own stricter per-IP bucket (password guessing). */
const AUTH_METHODS = new Set(["login", "login2fa", "setSubPassword"]);

/* --- signature tables (all matched case-insensitively) ------------------ */

/* URL probes: never legitimate on this site. */
const PROBE_PATHS = [
  "/.git/",
  "/.env",
  "/.aws/",
  "/.ssh/",
  "wp-admin",
  "wp-login",
  "phpmyadmin",
  "xmlrpc.php",
  "server-status",
  "server-info",
  ".php",
  ".asp",
  ".aspx",
  ".jsp",
  "cgi-bin",
  "actuator",
  ".well-known/security",
];
const PROBE_RE = new RegExp(
  PROBE_PATHS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i"
);

/* Encoded traversal / null bytes / double-encoding tricks. */
const TRAVERSAL_RES = [
  /\.\./,
  /%2e/i,
  /%252e/i,
  /%c0%ae/i,
  /%00/,
  /\\/,
  /%5c/i,
];

/* High-confidence injection signatures (URL/query/headers only — request
   bodies are JSON the office typed, scanned separately and narrowly). */
const SIG_RES = [
  /* SQL injection. */
  /union\s+select/i,
  /information_schema/i,
  /sleep\s*\(\s*\d/i,
  /benchmark\s*\(/i,
  /extractvalue\s*\(/i,
  /updatexml\s*\(/i,
  /'\s*or\s+'1'\s*=\s*'1/i,
  /"\s*or\s+"1"\s*=\s*"1/i,
  /;\s*--/,
  /\/\*/,
  /xp_cmdshell/i,
  /load_file\s*\(/i,
  /into\s+(outfile|dumpfile)/i,
  /pg_sleep/i,
  /* Cross-site scripting. */
  /<script[\s>]/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /expression\s*\(/i,
  /<svg[\s>]/i,
  /<iframe[\s>]/i,
  /document\.cookie/i,
  /* Command injection. */
  /\$\(/,
  /\$\{/,
  /;\s*(cat|ls|id|whoami|uname)\b/i,
  /\|\s*(cat|ls|id|whoami|uname)\b/i,
  /&&\s*(id|cat|ls)\b/i,
  /\|\|\s*(id|cat|ls)\b/i,
  /\/bin\/(ba)?sh/i,
  /cmd\.exe/i,
  /powershell/i,
  /nc\s+-[elv]/i,
  /* Template / expression injection. */
  /\{\{\s*7\s*\*\s*7\s*\}\}/,
  /\$\{\s*7\s*\*\s*7\s*\}/,
  /#\{\s*7\s*\*\s*7\s*\}/,
  /<%/,
  /%>/,
  /* XXE / LDAP / JNDI / SSI. */
  /<!entity/i,
  /\bldap:\/\//i,
  /\$\{jndi/i,
  /<!--\s*#/i,
];

const SCANNER_UA_RES = [
  /sqlmap/i,
  /nikto/i,
  /nessus/i,
  /masscan/i,
  /\bnmap\b/i,
  /hydra/i,
  /burp/i,
  /zgrab/i,
  /dirbuster/i,
  /gobuster/i,
  /acunetix/i,
  /openvas/i,
  /wpscan/i,
];

/* RPC-body rules: prototype pollution is always hostile; role-grant fields
   smuggled past the drawer are always an escalation attempt. */
const BODY_BAD_RES = [
  /"__proto__"\s*:/,
  /"constructor"\s*:\s*\{[^}]*"prototype"/,
  /"role"\s*:\s*"admin"/i,
  /"isAdmin"\s*:\s*true/i,
  /"admin"\s*:\s*true/i,
  /<script[\s>]/i,
  /javascript\s*:/i,
];

const METHODS = new Set(["GET", "POST", "HEAD", "OPTIONS"]);

function cleanIp(raw) {
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
  if (!ip) return true;
  const low = String(ip).toLowerCase();
  if (low === "localhost" || low === "::1" || low === "::ffff:127.0.0.1") return true;
  if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^(fc|fd)/i.test(low) || /^fe[89ab]/i.test(low)) return true;
  return false;
}

/* Internal sync loops, not human sessions: the office-to-live publish relay
   (relay-*), the visitor on-air poll (rpt-*) and the follow loops
   (*follow). They rotate conn ids and carry the publish itself, so travel
   rules never touch them — flagging them would break the relay on any
   network that rotates egress IPs. */
const MACHINE_CONN_RE = /^(relay-|rpt-|livefollow|feedfollow|officefollow)/i;
function isMachineConn(id) {
  const s = String(id || "");
  return MACHINE_CONN_RE.test(s) || /follow/i.test(s);
}

export function createWaf(opts) {
  opts = opts || {};
  const clock = typeof opts.now === "function" ? opts.now : () => Date.now();
  const cfg = { ...DEFAULTS, ...(opts.limits || {}) };

  /* Sliding-window hit log per key: Map<key, number[]> (epoch ms). */
  const windows = new Map();
  /* Hard blocks: Map<key, unblockAt>. Keys are "ip:<ip>". */
  const blocks = new Map();
  /* Conn bindings: Map<connId, { ips: Map<ip, {at, country}>, authed: bool,
     authedAt, quarantinedUntil, deniedWrites: number[] }> */
  const conns = new Map();
  /* Geo: Map<ip, { country, at }>. */
  const geo = new Map();
  /* Counters + recent security events (truncated, bounded). */
  const counters = {
    inspected: 0,
    blockedSig: 0,
    blockedRate: 0,
    blockedEscalation: 0,
    quarantined: 0,
    travelFlags: 0,
    volumeFlags: 0,
    rpcGuarded: 0,
  };
  const recent = [];
  let lastLogAt = 0;

  function log(kind, ip, detail) {
    counters[kind] = (counters[kind] || 0) + 1;
    recent.push({ at: clock(), kind, ip: String(ip || "").slice(0, 64), detail: String(detail || "").slice(0, 160) });
    if (recent.length > cfg.maxEvents) recent.splice(0, recent.length - cfg.maxEvents);
    /* Sampled console line: a flood must never become a log-DoS of its own. */
    const t = clock();
    if (t - lastLogAt > 5000) {
      lastLogAt = t;
      try {
        console.warn(`[waf] ${kind} ip=${ip} ${String(detail || "").slice(0, 120)}`);
      } catch {}
    }
  }

  function hit(key, windowMs, max, blockMs) {
    const t = clock();
    let arr = windows.get(key);
    if (!arr) {
      arr = [];
      windows.set(key, arr);
    }
    while (arr.length && t - arr[0] > windowMs) arr.shift();
    arr.push(t);
    if (windows.size > 10000) {
      const oldest = windows.keys().next().value;
      windows.delete(oldest);
    }
    if (arr.length > max) {
      if (blockMs > 0) blocks.set(key, t + blockMs);
      return false;
    }
    return true;
  }

  function blocked(key) {
    const until = blocks.get(key);
    if (!until) return 0;
    const left = until - clock();
    if (left <= 0) {
      blocks.delete(key);
      return 0;
    }
    return Math.ceil(left / 1000);
  }

  function blockIp(ip, ms, kind, detail) {
    if (isLoopbackIp(ip)) {
      /* Never auto-block the office machine itself — scan and log only. */
      log(kind || "blockedSig", ip, `(loopback, not blocked) ${detail || ""}`);
      return;
    }
    blocks.set("ip:" + ip, clock() + ms);
    log(kind || "blockedSig", ip, detail || "");
  }

  function requestIp(req) {
    try {
      const h = (req && req.headers) || {};
      const fwd = h["x-forwarded-for"];
      if (typeof fwd === "string" && fwd.trim()) {
        const first = fwd.split(",")[0].trim();
        if (first) return cleanIp(first);
      }
      const real = h["x-real-ip"];
      if (typeof real === "string" && real.trim()) return cleanIp(real);
      const remote = req && req.socket && req.socket.remoteAddress;
      if (typeof remote === "string" && remote) return cleanIp(remote);
    } catch {}
    return "";
  }

  /* Route class drives per-class rate buckets: static files, admin RPC,
     uploads, or the read-only proxies. */
  function routeClass(path) {
    if (path.startsWith("/__cms/")) return "api";
    if (path === "/__upload" || path === "/__restore-file" || path === "/__delete-file") return "upload";
    if (path === "/__geo" || path === "/__rates" || path === "/__yt" || path === "/__live-url" || path === "/__waf-status") return "proxy";
    return "static";
  }

  function scanSignatures(hay) {
    if (PROBE_RE.test(hay)) return "probe-path";
    for (const re of TRAVERSAL_RES) {
      if (re.test(hay)) return "traversal";
    }
    for (const re of SIG_RES) {
      if (re.test(hay)) return "injection:" + String(re).slice(0, 48);
    }
    return "";
  }

  /** Front-door inspect. Returns { ok:true } or
      { ok:false, status, err, retryAfter, reason }. Never throws. */
  function inspect(req, ctx) {
    ctx = ctx || {};
    counters.inspected++;
    try {
      const method = String((req && req.method) || "GET").toUpperCase();
      const path = String(ctx.path || "/");
      const query = String(ctx.query || "");
      const connId = String(ctx.conn || "");
      const ip = ctx.ip || requestIp(req);
      const headers = (req && req.headers) || {};
      const ua = String(headers["user-agent"] || "").slice(0, 256);

      if (connId && ip) bindConn(connId, ip, ua);

      /* 1. Method allowlist. */
      if (!METHODS.has(method)) {
        blockIp(ip, cfg.ipBlockMs, "blockedSig", `bad-method ${method} ${path.slice(0, 80)}`);
        return { ok: false, status: 403, err: "blocked", reason: "bad-method" };
      }
      /* 2. Length caps (cheap parser-DoS net). */
      if (path.length + query.length > cfg.maxUrlLen || query.length > cfg.maxQueryLen) {
        blockIp(ip, cfg.ipBlockMs, "blockedSig", `overlong-url len=${path.length + query.length}`);
        return { ok: false, status: 414, err: "blocked", reason: "overlong-url" };
      }
      const headerNames = Object.keys(headers);
      if (headerNames.length > 60) {
        blockIp(ip, cfg.ipBlockMs, "blockedSig", "header-flood");
        return { ok: false, status: 403, err: "blocked", reason: "header-flood" };
      }
      /* 3. Hard block list (earlier verdicts). */
      const bl = blocked("ip:" + ip);
      if (bl > 0) {
        return { ok: false, status: 429, err: "rate-limited", retryAfter: bl, reason: "blocked-ip" };
      }
      /* 4. Signatures over the decoded request line + a few headers. */
      let hay = "";
      try {
        hay = decodeURIComponent(path) + "?" + decodeURIComponent(query);
      } catch {
        blockIp(ip, cfg.ipBlockMs, "blockedSig", "bad-encoding");
        return { ok: false, status: 403, err: "blocked", reason: "bad-encoding" };
      }
      hay = hay.slice(0, 8192);
      const uaHay = ua.slice(0, 512);
      for (const re of SCANNER_UA_RES) {
        if (re.test(uaHay)) {
          blockIp(ip, cfg.ipBlockMs, "blockedSig", `scanner-ua ${uaHay.slice(0, 60)}`);
          return { ok: false, status: 403, err: "blocked", reason: "scanner-ua" };
        }
      }
      const sig = scanSignatures(hay + " " + uaHay);
      if (sig) {
        blockIp(ip, cfg.ipBlockMs, "blockedSig", `${sig} ${path.slice(0, 80)}`);
        return { ok: false, status: 403, err: "blocked", reason: sig };
      }
      /* 5. Per-class rate limits (loopback exempt from auto-block). */
      const cls = routeClass(path);
      const loopback = isLoopbackIp(ip);
      const check = (key, rule) => {
        if (loopback) return true;
        return hit(key, rule[1], rule[0], rule[2]);
      };
      if (!check("all:" + ip, cfg.globalPerIp)) {
        log("blockedRate", ip, `global ${path.slice(0, 80)}`);
        return { ok: false, status: 429, err: "rate-limited", retryAfter: 60, reason: "global-rate" };
      }
      if (cls === "api") {
        if (!check("api:" + ip, cfg.apiPerIp)) {
          log("blockedRate", ip, `api ${path.slice(0, 80)}`);
          return { ok: false, status: 429, err: "rate-limited", retryAfter: 120, reason: "api-rate" };
        }
        if (connId && !check("rpc:" + connId, cfg.rpcPerConn)) {
          log("volumeFlags", ip, `conn-burst conn=${connId.slice(0, 12)}`);
          return { ok: false, status: 429, err: "rate-limited", retryAfter: 120, reason: "conn-rate" };
        }
      } else if (cls === "upload") {
        if (!check("up:" + ip, cfg.uploadPerIp)) {
          log("blockedRate", ip, "upload-rate");
          return { ok: false, status: 429, err: "rate-limited", retryAfter: 300, reason: "upload-rate" };
        }
      } else if (cls === "proxy") {
        if (!check("px:" + ip, cfg.proxyPerIp)) {
          log("blockedRate", ip, `proxy ${path.slice(0, 40)}`);
          return { ok: false, status: 429, err: "rate-limited", retryAfter: 120, reason: "proxy-rate" };
        }
      }
      /* Auth doors get their own strict bucket on top (password guessing). */
      if (cls === "api" && ctx.rpc && AUTH_METHODS.has(ctx.rpc)) {
        if (!check("auth:" + ip, cfg.authPerIp)) {
          log("blockedRate", ip, `auth ${ctx.rpc}`);
          return { ok: false, status: 429, err: "rate-limited", retryAfter: 300, reason: "auth-rate" };
        }
      }
      return { ok: true, ip, route: cls };
    } catch {
      return { ok: true };
    }
  }

  /** Scan a POST RPC body BEFORE dispatch. Bounded linear scan. */
  function scanBody(text) {
    try {
      const s = String(text || "");
      if (s.length > 8 * 1024 * 1024) return { ok: false, reason: "oversize-body" };
      const head = s.slice(0, cfg.scanBodyBytes);
      for (const re of BODY_BAD_RES) {
        if (re.test(head)) return { ok: false, reason: "escalation-body" };
      }
      return { ok: true };
    } catch {
      return { ok: true };
    }
  }

  function bindConn(connId, ip, ua) {
    try {
      if (!connId || !ip) return;
      let c = conns.get(connId);
      if (!c) {
        if (conns.size > 5000) conns.delete(conns.keys().next().value);
        c = { ips: new Map(), authed: false, authedAt: 0, quarantinedUntil: 0, deniedWrites: [] };
        conns.set(connId, c);
      }
      const rec = c.ips.get(ip);
      const t = clock();
      if (!rec) {
        c.ips.set(ip, { at: t, ua: String(ua || "").slice(0, 120) });
        if (c.ips.size > 10) c.ips.delete(c.ips.keys().next().value);
        /* IP switches alone never block (DHCP renew, WiFi/cellular hop,
           dual-WAN egress rotation, VPN on/off in the same country): they
           only flag for visibility. Quarantine is reserved for a
           geo-confirmed country hop in noteGeo(). Machine loops are exempt. */
        if (!isMachineConn(connId) && c.authed && t - c.authedAt < cfg.travelWindowMs && c.ips.size >= cfg.travelIpsBeforeFlag && t - (c.lastFlagAt || 0) > cfg.travelWindowMs) {
          let localOnly = true;
          try {
            for (const pip of c.ips.keys()) {
              if (!isLoopbackIp(pip)) {
                localOnly = false;
                break;
              }
            }
          } catch {
            localOnly = false;
          }
          if (!localOnly) {
            c.lastFlagAt = t;
            counters.travelFlags++;
            log("travelFlags", ip, `ip-switch conn=${connId.slice(0, 12)} ips=${[...c.ips.keys()].slice(0, 3).join(",")}`);
          }
        }
      } else {
        rec.at = t;
      }
    } catch {}
  }

  /** Geo callback: wire from the geo proxy (handleGeo) so travel checks can
      compare countries, not just addresses. */
  function noteGeo(ip, country) {
    try {
      if (!ip || !country) return;
      geo.set(ip, { country: String(country).slice(0, 8), at: clock() });
      if (geo.size > 5000) geo.delete(geo.keys().next().value);
      /* Country-level travel: same authed conn, two countries, minutes apart. */
      for (const [cid, c] of conns) {
        if (!c.authed || !c.ips.has(ip)) continue;
        if (isMachineConn(cid)) continue;
        const t = clock();
        if (t - c.authedAt > cfg.travelWindowMs) continue;
        const lands = new Set();
        for (const [pip] of c.ips) {
          const g = geo.get(pip);
          if (g && t - g.at < 24 * 3600 * 1000) lands.add(g.country);
        }
        if (lands.size >= 2 && t - (c.lastTravelAt || 0) > cfg.travelWindowMs) {
          c.lastTravelAt = t;
          c.quarantinedUntil = t + cfg.quarantineMs;
          counters.travelFlags++;
          counters.quarantined++;
          log("travelFlags", ip, `country-hop conn=${cid.slice(0, 12)} ${[...lands].join("/")}`);
        }
      }
    } catch {}
  }

  function noteAuthed(connId) {
    try {
      let c = conns.get(connId);
      if (!c) {
        c = { ips: new Map(), authed: false, authedAt: 0, quarantinedUntil: 0, deniedWrites: [] };
        conns.set(connId, c);
      }
      c.authed = true;
      c.authedAt = clock();
      c.quarantinedUntil = 0;
      c.deniedWrites = [];
    } catch {}
  }

  function isQuarantined(connId) {
    try {
      const c = conns.get(connId);
      return !!(c && c.quarantinedUntil > clock());
    } catch {
      return false;
    }
  }

  /** RPC-layer guard (context half). isAdmin is a caller-supplied sync check
      so this module never touches the content store. */
  function rpcGuard(method, connId, raw, isAdmin) {
    counters.rpcGuarded++;
    try {
      const m = String(method || "");
      /* liveReport doubles as a public read: an empty body only ASKS for the
         latest office on-air report (every visitor polls it), so it passes
         like any other read. A non-empty body STORES a report and stays a
         guarded admin write below. */
      if (m === "liveReport" && !String(raw || "").trim()) return { ok: true };
      const authed = (() => {
        try {
          return !!isAdmin();
        } catch {
          return false;
        }
      })();
      if (WRITE_METHODS.has(m)) {
        if (isQuarantined(connId)) {
          log("blockedEscalation", "", `quarantined-write ${m} conn=${String(connId).slice(0, 12)}`);
          return { ok: false, status: 403, err: "session-quarantine" };
        }
        if (!authed) {
          /* Privilege escalation attempt: count, and block the source after
             a few denied writes inside the window. */
          let c = conns.get(connId);
          if (!c) {
            c = { ips: new Map(), authed: false, authedAt: 0, quarantinedUntil: 0, deniedWrites: [] };
            conns.set(connId, c);
          }
          const t = clock();
          c.deniedWrites = (c.deniedWrites || []).filter((at) => t - at < cfg.deniedWriteWindowMs);
          c.deniedWrites.push(t);
          /* The IP that carried this attempt: last bound address, if any. */
          let ip = "";
          try {
            const keys = [...c.ips.keys()];
            ip = keys[keys.length - 1] || "";
          } catch {}
          log("blockedEscalation", ip, `denied-write ${m} conn=${String(connId).slice(0, 12)} n=${c.deniedWrites.length}`);
          if (c.deniedWrites.length >= cfg.deniedWritesBeforeBlock && ip) {
            blockIp(ip, cfg.ipBlockMs, "blockedEscalation", `escalation-burst ${m}`);
          }
          return { ok: false, status: 403, err: "denied" };
        }
      }
      return { ok: true };
    } catch {
      return { ok: true };
    }
  }

  function noteRpcOutcome(method, connId, okFlag, status, bodyText) {
    try {
      const m = String(method || "");
      /* Successful sign-in (re)anchors the session: clears quarantine. */
      if ((m === "login" || m === "login2fa" || m === "setSubPassword") && okFlag) {
        try {
          const d = JSON.parse(String(bodyText || "{}"));
          if (d && d.ok === true && (d.role === "main" || d.role === "sub")) noteAuthed(connId);
        } catch {}
      }
      /* Reads at scraping volume from one conn get flagged (never blocked —
         visitors share IPs behind NAT; the per-IP rate caps already throttle). */
      if ((m === "getContent" || m === "contentRev") && connId) {
        const key = "read:" + connId;
        let arr = windows.get(key);
        if (!arr) {
          arr = [];
          windows.set(key, arr);
        }
        const t = clock();
        while (arr.length && t - arr[0] > 60 * 1000) arr.shift();
        arr.push(t);
        if (arr.length > cfg.readBurstPerConn) {
          windows.set(key, []);
          counters.volumeFlags++;
          log("volumeFlags", "", `read-burst ${m} conn=${String(connId).slice(0, 12)} n=${arr.length}`);
        }
      }
    } catch {}
  }

  function status() {
    const t = clock();
    const activeBlocks = [];
    for (const [k, until] of blocks) {
      if (until > t && activeBlocks.length < 50) activeBlocks.push({ key: k, retryInSec: Math.ceil((until - t) / 1000) });
    }
    return {
      counters: { ...counters },
      activeBlocks,
      quarantinedConns: [...conns.entries()].filter(([, c]) => c.quarantinedUntil > t).length,
      trackedConns: conns.size,
      trackedIps: windows.size,
      recent: recent.slice(-50).reverse(),
    };
  }

  /** Non-breaking hardening headers for every response (static + API). */
  function securityHeaders() {
    return {
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
    };
  }

  return {
    inspect,
    scanBody,
    rpcGuard,
    noteRpcOutcome,
    bindConn,
    noteGeo,
    noteAuthed,
    isQuarantined,
    status,
    securityHeaders,
    requestIp,
  };
}
