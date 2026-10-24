/* scripts/session-anomaly.mjs — real-time session anomaly detection.
   Watches, per request + per RPC, for:
   (1) impossible travel — same admin session/conn from two places too far apart,
       too fast (IP change + optional country change);
   (2) unusual data-access volume — scraping/getContent floods, upload bursts,
       denied-door probing;
   (3) privilege-escalation attempts — login guessing, token guessing on the
       internal adopt doors, sub->main attempts, TOTP/invite abuse, MAIN_OFF games.

   Runs in the Node layer (serve.mjs + vite-cms-backend.mjs), OUTSIDE the content
   VM, so it can see IPs the server code never sees. It never blocks legitimate
   traffic by itself — it emits events to the security log; only the WAF blocks,
   and only on URL patterns. This file only WATCHES and WARNS.

   Works online AND offline: travel detection falls back to IP-prefix comparison
   (no network needed); country comparison is best-effort when a lookup is
   supplied (the geo proxy result), never required.
*/

const WINDOW_MS = 10 * 60 * 1000;
const TRAVEL_MS = 30 * 60 * 1000;

function ipPrefix(ip) {
  const s = String(ip || "");
  if (!s || s === "unknown") return "unknown";
  if (s.includes(".")) return s.split(".").slice(0, 2).join(".");
  if (s.includes(":")) return s.split(":").slice(0, 3).join(":");
  return s.slice(0, 8);
}

function isLocalIp(ip) {
  const s = String(ip || "").toLowerCase();
  if (!s || s === "unknown") return true;
  if (s === "127.0.0.1" || s === "::1" || s === "localhost") return true;
  if (/^10\./.test(s) || /^192\.168\./.test(s) || /^127\./.test(s)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(s)) return true;
  return false;
}

export function createAnomalyTracker({ onEvent } = {}) {
  const byConn = new Map(); // connId -> { ips:Set, firstSeen, lastSeen, lastPrefix, lastCountry, rpc:{method:count[]}, fails, denied, admin, logins }
  const byIp = new Map(); // ip -> { reqs:[], rpcs:[], fails, denied, conns:Set, lastSeen }

  function emit(e) {
    try { onEvent && onEvent({ source: "anomaly", ...e }); } catch {}
  }

  function connRec(id) {
    let r = byConn.get(id);
    if (!r) {
      r = { ips: new Set(), firstSeen: Date.now(), lastSeen: 0, lastPrefix: "", lastCountry: "", rpc: new Map(), fails: 0, denied: 0, successes: 0, adoptDenied: 0, lastIp: "" };
      byConn.set(id, r);
      if (byConn.size > 5000) byConn.delete(byConn.keys().next().value);
    }
    return r;
  }

  function ipRec(ip) {
    let r = byIp.get(ip);
    if (!r) {
      r = { reqs: [], rpcs: [], fails: 0, denied: 0, conns: new Set(), lastSeen: 0 };
      byIp.set(ip, r);
      if (byIp.size > 5000) byIp.delete(byIp.keys().next().value);
    }
    return r;
  }

  function prune(arr, ms) {
    const now = Date.now();
    while (arr.length && now - arr[0] > ms) arr.shift();
  }

  /* Call for EVERY http request (before routing). Never throws. */
  function noteHttp({ ip, connId }) {
    try {
      const now = Date.now();
      const ir = ipRec(ip);
      ir.reqs.push(now); prune(ir.reqs, WINDOW_MS);
      ir.lastSeen = now;
      if (connId) ir.conns.add(connId);
      const cr = connRec(connId || ("anon:" + ip));
      cr.lastSeen = now;
      if (ip && !cr.ips.has(ip)) {
        const prevPrefix = cr.lastPrefix;
        const prevIp = cr.lastIp;
        cr.ips.add(ip);
        const prefix = ipPrefix(ip);
        // Same session suddenly from a different network: possible session theft
        // or the office moved networks (phone <-> wifi). Medium, with guidance.
        if (prevPrefix && prefix !== prevPrefix && !isLocalIp(ip) && !isLocalIp(prevIp) && now - cr.firstSeen < 12 * 3600 * 1000 && cr.ips.size >= 2) {
          if (!cr._travelWarned || now - cr._travelWarned > TRAVEL_MS) {
            cr._travelWarned = now;
            emit({
              kind: "impossible-travel", severity: "medium", ip, connId,
              detail: `session ${String(connId).slice(0, 24)} moved networks (${prevPrefix}.x → ${prefix}.x)`,
              hint: "Could be the office switching Wi-Fi/VPN — but could also be a stolen session. Ask: did the admin travel or toggle VPN? If not, sign out all sessions (Admin → Tools → Sign out), rotate the admin password, and block the new IP.",
            });
          }
        }
        cr.lastPrefix = prefix;
        cr.lastIp = ip;
      }
      // Flood watch (HTTP level; the WAF owns blocking, we own the warning).
      if (ir.reqs.length === 200) {
        emit({ kind: "volume", severity: "medium", ip, connId, detail: `${ir.reqs.length} requests in 10 min from ${ip}`, hint: "Unusual volume — possible scraping or flood. If it keeps climbing, block the IP at the host firewall; normal browsing is far below this." });
      }
    } catch {}
  }

  /* Optional country signal (from the geo proxy answer or x-wom-geo). */
  function noteGeo({ ip, connId, country }) {
    try {
      const c = String(country || "").trim().toUpperCase();
      if (!c || c.length < 2) return;
      const cr = connRec(connId || ("anon:" + ip));
      if (cr.lastCountry && cr.lastCountry !== c && Date.now() - cr.firstSeen < 12 * 3600 * 1000) {
        if (!cr._countryWarned || Date.now() - cr._countryWarned > TRAVEL_MS) {
          cr._countryWarned = Date.now();
          emit({
            kind: "impossible-travel", severity: "high", ip, connId,
            detail: `admin session moved country ${cr.lastCountry} → ${c} within the session lifetime`,
            hint: "HIGH: real admins rarely change country mid-session. Treat as possible session theft until proven otherwise: sign out everywhere, rotate the admin password + sub-admin passwords, turn on two-factor, and block the new IP.",
          });
        }
      } else {
        cr.lastCountry = c;
      }
    } catch {}
  }

  /* Call after every __cms RPC (with its result). method = rpc name. */
  function noteRpc({ ip, connId, method, ok, err }) {
    try {
      const now = Date.now();
      const m = String(method || "");
      const cr = connRec(connId || ("anon:" + ip));
      const ir = ipRec(ip);
      cr.lastSeen = now;
      let arr = cr.rpc.get(m);
      if (!arr) { arr = []; cr.rpc.set(m, arr); }
      arr.push(now); prune(arr, WINDOW_MS);
      ir.rpcs.push(now); prune(ir.rpcs, WINDOW_MS);

      const denied = ok !== true;
      if (denied) { cr.denied++; ir.denied++; }

      // --- privilege-escalation signals ---
      if ((m === "login" || m === "login2fa" || m === "setSubPassword") && denied) {
        cr.fails++; ir.fails++;
        if (ir.fails === 5) emit({ kind: "privilege-escalation", severity: "medium", ip, connId, detail: `5 failed sign-ins from ${ip} (${m}: ${err || "denied"})`, hint: "Possible password guessing. It is rate-limited already. If it keeps going, block the IP; if it was you, wait 10 minutes (the window) and try again." });
        if (ir.fails === 15) emit({ kind: "privilege-escalation", severity: "high", ip, connId, detail: `15 failed sign-ins from ${ip} — sustained guessing`, hint: "HIGH: sustained guessing against admin sign-in. Block the IP at the host firewall now. Do NOT turn off rate limiting. Consider turning on two-factor (Admin → Tools)." });
      }
      if ((m === "login" || m === "login2fa") && ok === true) {
        if (cr.fails >= 3) emit({ kind: "privilege-escalation", severity: "high", ip, connId, detail: `sign-in succeeded after ${cr.fails} failures on this session`, hint: "Could be the office finally typing it right — but after several failures, verify it was really you. If not, rotate the admin password + enable two-factor immediately." });
        cr.successes++;
        cr.fails = 0;
      }
      if ((m === "adoptLive" || m === "adoptFeed") && denied) {
        cr.adoptDenied++;
        emit({ kind: "privilege-escalation", severity: "critical", ip, connId, detail: `denied internal-door call ${m} (${err || "denied"})`, hint: "CRITICAL: only this machine's own loop knows the adopt token. Someone is probing the internal sync door. Ensure the server is not port-forwarded to the internet beyond what DEPLOY.md describes; restart the server (rotates the token) and block the IP." });
      }
      if ((m === "checkAdmin" || m === "liveReport" || m === "publish" || m === "undoPublish") && denied && (err === "denied" || err === "unauthorized" || err === "idle-expired")) {
        if (cr.denied === 4) emit({ kind: "privilege-escalation", severity: "medium", ip, connId, detail: `4 denied admin-door calls on session ${String(connId).slice(0, 24)} (${m})`, hint: "Someone (or a stale office tab) is touching admin doors without a live session. If no office tab is open, block the IP and check who knew the admin URL." });
      }
      if ((m === "setMainPassword" || m === "inviteSub" || m === "deleteSub" || m === "setMainOff" || m === "totpSetup") && denied) {
        emit({ kind: "privilege-escalation", severity: "high", ip, connId, detail: `denied account-control call ${m} (${err || "denied"})`, hint: "HIGH: an attempt to change passwords/roster/2FA without rights. If unexpected, rotate the main password, review sub-admins (Admin → Tools), and block the IP." });
      }
      // --- volume signals ---
      if (m === "getContent" && arr.length === 60) {
        emit({ kind: "volume", severity: "medium", ip, connId, detail: `60 content reads in 10 min from ${ip}`, hint: "Possible scraping. Content is public, so this is usually harmless — but if the same IP keeps pulling, rate-limit or block it." });
      }
      if (ir.rpcs.length === 400) {
        emit({ kind: "volume", severity: "high", ip, connId, detail: `400 admin-API calls in 10 min from ${ip}`, hint: "HIGH: far above human use. Likely automated probing. Block the IP at the host firewall and review the log for which doors it touched." });
      }
      if (ir.denied === 20) {
        emit({ kind: "volume", severity: "high", ip, connId, detail: `20 denied admin calls from ${ip}`, hint: "HIGH: repeated denied attempts = probing, not accidents. Block the IP and verify no account changes happened (Admin → Tools → sub-admins, password)." });
      }
    } catch {}
  }

  function noteUpload({ ip, connId, bytes, denied }) {
    try {
      if (denied) {
        emit({ kind: "privilege-escalation", severity: "medium", ip, connId, detail: `denied file upload from ${ip}`, hint: "The file doors need a signed-in admin. Repeated denials = someone probing uploads. Block the IP if it repeats." });
        return;
      }
      const ir = ipRec(ip);
      ir._upBytes = (ir._upBytes || 0) + (bytes || 0);
      if (ir._upBytes > 500 * 1024 * 1024 && !ir._upWarned) {
        ir._upWarned = true;
        emit({ kind: "volume", severity: "high", ip, connId, detail: `over 500 MB uploaded from ${ip} this session`, hint: "HIGH: huge upload volume. Check data/uploads/ for unexpected files (especially .svg/.html — the server refuses those, but look anyway) and delete anything the office did not put there." });
      }
    } catch {}
  }

  function stats() {
    return { conns: byConn.size, ips: byIp.size };
  }

  return { noteHttp, noteGeo, noteRpc, noteUpload, stats };
}
