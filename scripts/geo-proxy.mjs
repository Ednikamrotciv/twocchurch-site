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
    url: "https://ipapi.co/json/",
    read: (json) => ({ tz: nonEmpty(json?.timezone), place: nonEmpty(json?.city), country: nonEmpty(json?.country_code), currency: nonEmpty(json?.currency) }),
  },
  {
    url: "https://get.geojs.io/v1/ip/geo.json",
    read: (json) => ({ tz: nonEmpty(json?.timezone), place: nonEmpty(json?.city), country: nonEmpty(json?.country_code), currency: "" }),
  },
  {
    url: "https://ipinfo.io/json",
    read: (json) => ({ tz: nonEmpty(json?.timezone), place: nonEmpty(json?.city), country: nonEmpty(json?.country), currency: "" }),
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
  let geoCache = null;
  let ratesCache = null;

  async function lookupGeo() {
    if (geoCache && Date.now() - geoCache.at < GEO_TTL_MS) return geoCache.body;
    for (const source of GEO_SOURCES) {
      try {
        const answer = source.read(await fetchJson(source.url));
        if (answer && validTimezone(answer.tz)) {
          const body = { tz: answer.tz, place: answer.place, country: answer.country, currency: answer.currency };
          geoCache = { at: Date.now(), body };
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

  async function handleGeo(_req, res) {
    try {
      const body = await lookupGeo();
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
