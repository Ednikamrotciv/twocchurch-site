const GEO_TTL_MS = 6 * 3600 * 1000;
const RATES_TTL_MS = 6 * 3600 * 1000;
const UPSTREAM_TIMEOUT_MS = 8000;
const MIN_RATE_ENTRIES = 40;

const nonEmpty = (v) => (typeof v === "string" ? v.trim() : "");

function validTimezone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function withTimeout(ms) {
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  } catch { /* fall through to no signal */ }
  return undefined;
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: withTimeout(UPSTREAM_TIMEOUT_MS), headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return res.json();
}

const GEO_SOURCES = [
  {
    url: (ip) => (ip ? `https://ipwho.is/${encodeURIComponent(ip)}` : "https://ipwho.is/json/"),
    read: (json) => ({
      tz: nonEmpty(json?.timezone?.id || json?.timezone),
      place: nonEmpty(json?.city),
      country: nonEmpty(json?.country_code || json?.country),
      currency: nonEmpty(json?.currency?.code || json?.currency),
    }),
  },
  {
    url: (ip) => (ip ? `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json` : "https://get.geojs.io/v1/ip/geo.json"),
    read: (json) => ({ tz: nonEmpty(json?.timezone), place: nonEmpty(json?.city), country: nonEmpty(json?.country_code), currency: "" }),
  },
  {
    url: (ip) => (ip ? `https://ipinfo.io/${encodeURIComponent(ip)}/json` : "https://ipinfo.io/json"),
    read: (json) => ({ tz: nonEmpty(json?.timezone), place: nonEmpty(json?.city), country: nonEmpty(json?.country), currency: "" }),
  },
  {
    url: (ip) => (ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : "https://ipapi.co/json/"),
    read: (json) => ({ tz: nonEmpty(json?.timezone), place: nonEmpty(json?.city), country: nonEmpty(json?.country_code), currency: nonEmpty(json?.currency) }),
  },
];

const RATE_SOURCES = [
  {
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    read: (json) => (json && json.usd && typeof json.usd === "object" ? json.usd : null),
  },
  {
    url: "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
    read: (json) => (json && json.usd && typeof json.usd === "object" ? json.usd : null),
  },
  {
    url: "https://open.er-api.com/v6/latest/USD",
    read: (json) => (json && json.rates && typeof json.rates === "object" ? json.rates : null),
  },
];

function cleanRates(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const [code, value] of Object.entries(raw)) {
    const key = String(code).trim().toUpperCase();
    const n = Number(value);
    if (/^[A-Z]{3}$/.test(key) && Number.isFinite(n) && n > 0) out[key] = n;
  }
  if (!out.USD || Object.keys(out).length < MIN_RATE_ENTRIES) return null;
  return out;
}

export function createGeoProxy() {
  /* Per-visitor answers: one cache entry per IP (a single global entry would
     hand the first visitor's place to everyone). Rates stay global. */
  const geoCache = new Map();
  let ratesCache = null;

  /** The address the visitor arrived on (through proxies/CDNs when present). */
  function clientIp(req) {
    try {
      const forwarded = req?.headers?.["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded.trim()) {
        const first = forwarded.split(",")[0].trim();
        if (first) return cleanIp(first);
      }
      const real = req?.headers?.["x-real-ip"];
      if (typeof real === "string" && real.trim()) return cleanIp(real);
      const remote = req?.socket?.remoteAddress;
      if (typeof remote === "string" && remote) return cleanIp(remote);
    } catch { /* unknown — the server-IP lookup below covers it */ }
    return "";
  }

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

  /** Local/private addresses carry no public place — look those up by server. */
  function isPrivateIp(ip) {
    if (!ip) return true;
    const low = ip.toLowerCase();
    if (low === "localhost" || low === "::1" || low === "::ffff:127.0.0.1") return true;
    if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
    if (/^169\.254\./.test(ip)) return true;
    if (/^(fc|fd)/i.test(low) || /^fe[89ab]/i.test(low)) return true;
    return false;
  }

  async function lookupGeo(ip) {
    const key = ip || "server";
    const hit = geoCache.get(key);
    if (hit && Date.now() - hit.at < GEO_TTL_MS) return hit.body;
    for (const source of GEO_SOURCES) {
      try {
        const answer = source.read(await fetchJson(source.url(ip)));
        if (answer && validTimezone(answer.tz)) {
          const body = { tz: answer.tz, place: answer.place, country: answer.country, currency: answer.currency };
          geoCache.set(key, { at: Date.now(), body });
          if (geoCache.size > 500) geoCache.delete(geoCache.keys().next().value);
          return body;
        }
      } catch { /* try the next source */ }
    }
    return null;
  }

  async function lookupRates() {
    if (ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS) return ratesCache.body;
    for (const source of RATE_SOURCES) {
      try {
        const rates = cleanRates(source.read(await fetchJson(source.url)));
        if (rates) {
          const body = { base: "USD", rates, at: Date.now(), source: "live" };
          ratesCache = { at: Date.now(), body };
          return body;
        }
      } catch { /* try the next source */ }
    }
    return null;
  }

  function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(text);
  }

  async function handleGeo(req, res) {
    try {
      /* A VPN or office network arrives on its own public address — look that
         address up, so the answer follows the visitor, VPN and all. */
      const raw = clientIp(req);
      const body = await lookupGeo(isPrivateIp(raw) ? "" : raw);
      if (!body) sendJson(res, 502, { error: "unreachable" });
      else sendJson(res, 200, body);
    } catch {
      sendJson(res, 502, { error: "unreachable" });
    }
  }

  async function handleRates(_req, res) {
    try {
      const body = await lookupRates();
      if (!body) sendJson(res, 502, { error: "unreachable" });
      else sendJson(res, 200, body);
    } catch {
      sendJson(res, 502, { error: "unreachable" });
    }
  }

  return { handleGeo, handleRates };
}
