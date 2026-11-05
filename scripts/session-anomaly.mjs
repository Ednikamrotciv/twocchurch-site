// session-anomaly.mjs — real-time session anomaly detection.
// Watches, per admin session (conn id) and per IP:
//
//   1. possible travel      — one session id appearing from two distant networks
//                             within minutes (impossible-travel)
//   2. unusual data volume  — read/write/denied bursts far above office norms
//   3. privilege escalation — anonymous connections calling admin-only RPCs,
//                             adopt-token guessing, repeated denied/file-door hits
//
// Zero dependencies, in-memory only (a restart resets baselines — safe).
// Every finding is logged through security-log with severity + IP + hint.
import { PRIVILEGED_RPCS } from "./waf.mjs";

const ADMIN_WRITE = new Set([...PRIVILEGED_RPCS, "adoptLive", "adoptFeed"]);
const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

function isLoopback(ip) {
  const s = String(ip || "").toLowerCase();
  return s === "-" || s === "::1" || s === "127.0.0.1" || s === "::ffff:127.0.0.1" || s.startsWith("127.") || s === "localhost";
}

function net16(ip) {
  const m = String(ip || "").match(/^(\d{1,3})\.(\d{1,3})\./);
  return m ? `${m[1]}.${m[2]}` : String(ip || "");
}

function prune(arr, now, windowMs) {
  while (arr.length && now - arr[0] > windowMs) arr.shift();
  return arr;
}

export function createSessionAnomaly({ log } = {}) {
  const conns = new Map(); // connId -> record
  const ipReq = new Map(); // ip -> timestamps[]
  const emit = (e) => {
    try {
      if (log) log(e);
    } catch {}
  };

  function getConn(id) {
    let c = conns.get(id);
    if (!c) {
      c = { ips: new Map(), firstSeen: Date.now(), lastSeen: 0, req: [], denied: [], writes: [], uas: new Set(), adminSeen: false, travelLoggedAt: 0, volLoggedAt: 0, escLoggedAt: 0 };
      conns.set(id, c);
      if (conns.size > 2000) {
        const first = conns.keys().next().value;
        conns.delete(first);
      }
    }
    return c;
  }

  // Called on EVERY http request (cheap: a few map ops). `quiet` is set for
  // harmless status/dev/static traffic (version.json, contentRev polls, Vite
  // HMR): the session is still tracked for travel detection, but volume
  // counters ignore it — three open dev tabs must not read as a scraper.
  function observe({ connId = "anon", ip = "-", route = "-", method = "GET", ua = "", quiet = false, netClass = "" } = {}) {
    const now = Date.now();
    const loop = isLoopback(ip);
    try {
      const c = getConn(String(connId || "anon"));
      if (ip && ip !== "-") {
        if (!c.ips.has(ip)) {
          const prev = [...c.ips.keys()].pop();
          c.ips.set(ip, now);
          if (!quiet && prev && prev !== ip && !isLoopback(ip) && !isLoopback(prev)) {
            const moved16 = net16(prev) !== net16(ip);
            const dt = now - (c.lastSeen || c.firstSeen);
            if (moved16 && dt < TEN_MIN && (c.adminSeen || c.req.length > 5) && now - c.travelLoggedAt > TEN_MIN) {
              c.travelLoggedAt = now;
              emit({
                level: c.adminSeen ? "high" : "medium",
                kind: "impossible-travel",
                ip,
                route,
                detail: `session ${connId} moved ${prev} -> ${ip} in ${Math.max(1, Math.round(dt / 1000))}s`,
                hint: "possible session sharing or theft. If the office did not move networks (phone <-> office in seconds is not normal), force sign-out (sessions idle-expire in 15 min; restarting the backend rotates tokens) and rotate the admin password.",
                source: "local",
              });
            }
          }
          if (!quiet && c.ips.size >= 8 && now - c.travelLoggedAt > TEN_MIN) {
            c.travelLoggedAt = now;
            emit({
              level: "medium",
              kind: "session-hopping",
              ip,
              route,
              detail: `session ${connId} seen from ${c.ips.size} IPs`,
              hint: "one session id roaming across many IPs — shared link, VPN, or scraping pool. If adminSeen, re-sign-in on the office copy.",
              source: "local",
            });
          }
        }
      }
      c.lastSeen = now;
      if (quiet) return;
      // per-IP volume (context for scrapers). Loopback is the office's own
      // machine (dev tabs + HMR + polls share ::1/127.0.0.1): a higher bar at
      // low severity, so dev noise never mints a "breach".
      let hits = ipReq.get(ip);
      if (!hits) {
        hits = [];
        ipReq.set(ip, hits);
        if (ipReq.size > 5000) ipReq.clear();
      }
      hits.push(now);
      prune(hits, now, FIVE_MIN);
      const ipLimit = loop ? 2000 : 600;
      if (hits.length === ipLimit) {
        emit({
          level: loop ? "low" : "medium",
          kind: "unusual-volume",
          ip,
          route,
          detail: `${hits.length} requests in 5 min from one IP${loop ? " (loopback dev machine)" : ""}`,
          hint: loop
            ? "office-machine traffic (tabs + HMR + polls share one loopback IP) — review only if no dev session explains it."
            : "likely a scraper or a stuck reload loop — WAF rate-limit throttles it automatically. Block the IP at the host firewall only if it persists for hours.",
          source: "local",
        });
      }
      // per-session record
      c.req.push(now);
      prune(c.req, now, FIVE_MIN);
      if (ua) {
        c.uas.add(String(ua).slice(0, 80));
        if (c.uas.size === 5) {
          emit({
            level: "low",
            kind: "ua-churn",
            ip,
            route,
            detail: `session ${connId} presented ${c.uas.size} user-agents`,
            hint: "usually dev-tools / browser updates, not an attack — ignore unless paired with denied writes.",
            source: "local",
          });
        }
      }
      const sessLimit = loop ? 1500 : 400;
      if (c.req.length === sessLimit && now - c.volLoggedAt > TEN_MIN) {
        c.volLoggedAt = now;
        emit({
          level: loop ? "low" : "medium",
          kind: "unusual-volume",
          ip,
          route,
          detail: `session ${connId}: ${c.req.length} requests in 5 min${loop ? " (loopback dev machine)" : ""}`,
          hint: "far above office norms (a publish is a handful of calls). Check for a runaway tab or scraper; throttle lifts by itself.",
          source: "local",
        });
      }
      void method;
      void netClass;
    } catch {}
  }

  // Called after each __cms RPC resolves (needs ok/err only — no extra I/O).
  function observeRpc({ connId = "anon", ip = "-", rpc = "", ok = true, err = "" } = {}) {
    const now = Date.now();
    try {
      const c = getConn(String(connId || "anon"));
      c.lastSeen = now;
      const e = String(err || "");
      const failed = !ok;
      if (ADMIN_WRITE.has(rpc) && (String(connId) === "anon" || String(connId).startsWith("livefollow") || String(connId).startsWith("officefollow") || String(connId) === "bake")) {
        // service accounts — not escalation
      } else if (!ok && PRIVILEGED_RPCS.has(rpc) && (e === "denied" || e === "unauthorized")) {
        c.denied.push(now);
        prune(c.denied, now, TEN_MIN);
        if (now - c.escLoggedAt > TEN_MIN) {
          c.escLoggedAt = now;
          emit({
            level: "high",
            kind: "privilege-escalation",
            ip,
            route: `/__cms/${rpc}`,
            detail: `anonymous/expired session attempted admin-only ${rpc} (${c.denied.length} denied in 10 min)`,
            hint: "someone (or a signed-out tab) is pressing admin doors. If the office just signed out, ignore. Otherwise: keep the 15-min idle expiry, use sub-admin accounts, and block repeat IPs at the host.",
            source: "local",
          });
        }
        return;
      }
      if (rpc === "adoptLive" || rpc === "adoptFeed") {
        if (!ok) {
          emit({
            level: "high",
            kind: "privilege-escalation",
            ip,
            route: `/__cms/${rpc}`,
            detail: `${rpc} rejected (${e || "denied"})`,
            hint: "the live-follow token is per-boot and loopback-only — a reject means a forged or replayed adopt. Restarting the backend rotates the token; no action unless it repeats.",
            source: "local",
          });
        }
        return;
      }
      if ((rpc === "login" || rpc === "login2fa" || rpc === "setSubPassword") && failed) {
        c.denied.push(now);
        prune(c.denied, now, TEN_MIN);
        if (c.denied.length === 6 || c.denied.length === 15) {
          emit({
            level: c.denied.length >= 15 ? "high" : "medium",
            kind: c.denied.length >= 15 ? "privilege-escalation" : "auth-probing",
            ip,
            route: `/__cms/${rpc}`,
            detail: `${c.denied.length} failed ${rpc} attempts in 10 min (this session)`,
            hint: "password/2FA guessing pace. Server already rate-limits per-connection and per-network — consider a host-firewall block if it continues, and confirm 2FA is on.",
            source: "local",
          });
        }
        return;
      }
      if (PRIVILEGED_RPCS.has(rpc) && !failed) {
        c.adminSeen = true;
        c.writes.push(now);
        prune(c.writes, now, FIVE_MIN);
        if (c.writes.length === 30) {
          emit({
            level: "medium",
            kind: "unusual-volume",
            ip,
            route: `/__cms/${rpc}`,
            detail: `session ${connId}: ${c.writes.length} admin writes in 5 min`,
            hint: "far above office norms — check the publish log for unexpected authors, then rotate passwords if anything is unfamiliar.",
            source: "local",
          });
        }
      }
      void failed;
    } catch {}
  }

  // File-door denies (uploads/restores/deletes without admin session). A single
  // deny is an expired tab, not a breach: first hits log LOW as `file-deny`
  // and only sustained probing (>=3 in 10 min) escalates to MEDIUM
  // privilege-escalation — which is the only one that can trigger a PDF.
  function observeFileDeny({ connId = "anon", ip = "-", route = "-" } = {}) {
    try {
      const now = Date.now();
      const c = getConn(String(connId || "anon"));
      c.denied.push(now);
      prune(c.denied, now, TEN_MIN);
      if (c.denied.length >= 3) {
        if (now - c.escLoggedAt < TEN_MIN) return;
        c.escLoggedAt = now;
        emit({
          level: "medium",
          kind: "privilege-escalation",
          ip,
          route,
          detail: `anonymous file-door hit (${c.denied.length} denied in 10 min, session ${connId})`,
          hint: "uploads/restores/deletes need a signed-in admin — this one had none. Occasional hits are expired tabs; sustained hits are probing — block the IP at the host.",
          source: "local",
        });
        return;
      }
      emit({
        level: "low",
        kind: "file-deny",
        ip,
        route,
        detail: `anonymous file-door hit (session ${connId}) — likely an expired tab`,
        hint: "uploads/restores/deletes need a signed-in admin. One-offs are expired tabs; escalates automatically if it repeats.",
        source: "local",
      });
    } catch {}
  }

  return { observe, observeRpc, observeFileDeny };
}
