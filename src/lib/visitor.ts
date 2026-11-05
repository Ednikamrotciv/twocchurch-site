/* Visitor place from IP only (direct fetch, so the service sees their address;
   notes 85, 98): clock + currency, cached for first-frame paint.
   No device fallback — when the IP services cannot answer, times show on the
   church's own clock and amounts in the church's own currency. */

import { useEffect } from "react";
import { useLocalState, writeStore } from "./hooks";
import {
  VISITOR_CLOCK_V,
  VISITOR_KEY,
  currencyOfCountry,
  isValidCurrency,
  isValidTimezone,
  normalizeVisitorClock,
  setVisitorClock,
  getVisitorClock,
  type VisitorClock,
} from "./store";

/** How long a found clock is trusted before it is looked up again. */
const FRESH_MS = 12 * 60 * 60 * 1000;
/** Give a service this long before moving on to the next one. */
const TIMEOUT_MS = 9000;

type Answer = { tz: string; place: string; country: string; currency: string; ip: string };

type Probe = { url: string; read: (json: any, text: string) => Omit<Answer, "ip"> };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Read across provider shapes: "a.b" walks nested objects, first hit wins. */
function pick(json: any, paths: string[]): string {
  for (const path of paths) {
    let node: any = json;
    for (const key of path.split(".")) {
      node = node && typeof node === "object" ? node[key] : undefined;
    }
    const value = str(node);
    if (value) return value;
  }
  return "";
}

const TZ_PATHS = ["timezone", "time_zone", "timezone.id", "timezone.name"];
const PLACE_PATHS = ["city", "city.name"];
const COUNTRY_PATHS = ["country_code", "country", "country.iso_code"];
const CURRENCY_PATHS = ["currency", "currency.code"];

/** Keyless CORS-open services, tried in order; first answer wins. */
const PROBES: Probe[] = [
  {
    /* Asked first: rich answer (zone, city, country and currency) with
       generous free limits — the reader tolerates flat or nested shapes. */
    url: "https://ipwho.is/json/",
    read: (json) => ({
      tz: pick(json, TZ_PATHS),
      place: pick(json, PLACE_PATHS),
      country: pick(json, COUNTRY_PATHS),
      currency: pick(json, CURRENCY_PATHS),
    }),
  },
  {
    /* Flat shape: generous keyless limits and rarely blocked, city included.
       No currency in the answer — the country table covers that. */
    url: "https://get.geojs.io/v1/ip/geo.json",
    read: (json) => ({ tz: str(json?.timezone), place: str(json?.city), country: str(json?.country_code), currency: "" }),
  },
  {
    /* Flat shape with currency included. */
    url: "https://api.ip.sb/geoip",
    read: (json) => ({
      tz: pick(json, TZ_PATHS),
      place: pick(json, PLACE_PATHS),
      country: pick(json, COUNTRY_PATHS),
      currency: pick(json, CURRENCY_PATHS),
    }),
  },
  {
    /* Richest answer: zone, city, country *and* currency, in one call — but it
       sits on blocklists and rate-limits hard, so it is the backup, not the lead. */
    url: "https://ipapi.co/json/",
    read: (json) => ({ tz: str(json?.timezone), place: str(json?.city), country: str(json?.country_code), currency: str(json?.currency) }),
  },
  {
    /* `country` here is already the two-letter code. */
    url: "https://ipinfo.io/json",
    read: (json) => ({ tz: str(json?.timezone), place: str(json?.city), country: str(json?.country), currency: "" }),
  },
  {
    /* Answers with the zone name as plain text and nothing else. */
    url: "https://ipapi.co/timezone/",
    read: (_json, text) => ({ tz: text.trim().split("\n")[0], place: "", country: "", currency: "" }),
  },
];

async function ask(probe: Probe): Promise<Answer | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(probe.url, { signal: controller.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) return null;
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* the plain-text service is expected to land here */
    }
    const answer = probe.read(json, text);
    /* Every JSON probe carries the address it looked up (`ip`) — the plain
       text one does not, and lands with a blank. */
    const full: Answer = { ...answer, ip: str(json && typeof json === "object" ? (json as any).ip : "") };
    return full && full.tz && isValidTimezone(full.tz) ? full : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** The site's own server, same address as the page itself: a VPN or filter
    list that blocks third-party geo domains cannot block this without
    breaking the site too. The server looks up the arriving address — VPN
    exit included — and answers with its place. */
async function askOwnServer(): Promise<Answer | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/__geo", { signal: controller.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) return null;
    const json = await res.json();
    const answer: Answer = { tz: str(json?.tz), place: str(json?.place), country: str(json?.country), currency: str(json?.currency), ip: str(json?.ip) };
    return answer.tz && isValidTimezone(answer.tz) ? answer : null;
  } catch {
    /* static hosting without the backend — the direct probes below cover it */
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** One IP service's answer, as the clock (and money) the site will read in. */
function ipClock(answer: Answer): VisitorClock {
  const country = /^[A-Za-z]{2}$/.test(answer.country) ? answer.country.toUpperCase() : "";
  return {
    tz: answer.tz,
    place: answer.place,
    country,
    currency: isValidCurrency(answer.currency) ? answer.currency.toUpperCase() : currencyOfCountry(country),
    ip: normIp(answer.ip),
    source: "ip",
    v: VISITOR_CLOCK_V,
    at: Date.now(),
  };
}

/** Find the visitor's clock from their IP address only. `null` when the IP
    services cannot answer — callers fall back to the church's own clock. */
export async function findVisitorClock(): Promise<VisitorClock | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  const own = await askOwnServer();
  if (own) return ipClock(own);
  for (const probe of PROBES) {
    const answer = await ask(probe);
    if (answer) return ipClock(answer);
  }
  return null;
}

/** Re-ask when missing, half a day old, or predating country/currency (note 98). */
function isStale(clock: VisitorClock | null): boolean {
  if (!clock) return true;
  if (clock.v !== VISITOR_CLOCK_V) return true;
  return Date.now() - clock.at >= FRESH_MS;
}

let inFlight: Promise<VisitorClock | null> | null = null;

/** One canonical shape for comparing addresses: services disagree on case,
    brackets and zone tags (`::FFFF:1.2.3.4`, `[2001:db8::1%eth0]`), and a
    cosmetic difference must never read as the visitor moving. */
function normIp(raw: unknown): string {
  let ip = (typeof raw === "string" ? raw : "").trim().toLowerCase().slice(0, 64);
  if (ip.startsWith("[")) ip = ip.replace(/^\[|\]$/g, "");
  const pct = ip.indexOf("%");
  if (pct >= 0) ip = ip.slice(0, pct);
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return /^[0-9a-f.:]{3,64}$/.test(ip) ? ip : "";
}

/** The address the network arrives on right now, or "" when the one-question
    service cannot answer. Tiny, keyless and CORS-open — it is only ever
    compared with the address the cached clock was looked up for. */
async function currentIp(): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) return "";
    return normIp((await res.json())?.ip);
  } catch {
    return "";
  } finally {
    window.clearTimeout(timer);
  }
}

/** Ask again when the visitor's address moved under a still-fresh clock — a
    VPN taken mid-visit otherwise sits on the old country's time and money
    for the rest of the cache window. The confirmed address is retained until
    a genuinely different one shows up: a failed check keeps it, and a
    cosmetic difference never counts as a move. Never blocks paint. */
let addrBackoffUntil = 0;
async function recheckAddress(): Promise<void> {
  try {
    if (Date.now() < addrBackoffUntil) return;
    const cached = normalizeVisitorClock(readCached());
    if (!cached || !cached.ip || inFlight) return;
    const now = await currentIp();
    if (!now || now === cached.ip || inFlight) return;
    /* Drop the stale answer first, so a failed re-ask falls back to the
       church clock rather than the old country's. */
    try {
      localStorage.removeItem(VISITOR_KEY);
    } catch {
      /* keep going — the refresh below still lands */
    }
    setVisitorClock(null);
    await refreshVisitorClock();
    /* When the fresh answer still disagrees with the address on the wire, the
       two sources are seeing different paths (split tunnel, proxy) — churning
       lookups would never settle, so the geo answer stands and the wire check
       rests half an hour. A real move afterwards still re-asks on load. */
    const fresh = normalizeVisitorClock(readCached());
    addrBackoffUntil = fresh && fresh.ip && fresh.ip !== now ? Date.now() + 30 * 60 * 1000 : 0;
  } catch {
    /* the page stands as-is */
  }
}

/** Look up now and remember; concurrent calls share the one lookup. */
export function refreshVisitorClock(): Promise<VisitorClock | null> {
  if (inFlight) return inFlight;
  inFlight = findVisitorClock()
    .then((clock) => {
      if (clock) {
        /* Both halves matter: the module copy is what every `siteTimezone()`
           call reads, and the localStorage write is what tells the mounted
           React tree to paint again (see `useVisitorClock`). */
        setVisitorClock(clock);
        writeStore(VISITOR_KEY, clock);
      }
      return clock;
    })
    .catch(() => null)
    .then((clock) => {
      inFlight = null;
      return clock;
    });
  return inFlight;
}

let started = false;

/** Start one lookup per load (never blocks paint). A slow or briefly-blocked
    network gets one more chance shortly after — without it, a visitor whose
    first lookup failed would sit on the church clock all visit. */
export function startVisitorClock() {
  if (started) return;
  started = true;
  if (!isStale(normalizeVisitorClock(readCached()))) {
    /* A fresh answer still gets its address confirmed, so a VPN taken since
       the lookup shows the new country's time and money. */
    void recheckAddress();
    return;
  }
  void refreshVisitorClock();
  window.setTimeout(() => {
    try {
      if (!getVisitorClock()) void refreshVisitorClock();
    } catch {
      /* the page stands as-is */
    }
  }, 10000);
}

function readCached(): unknown {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Visitor clock for React; mount at the top so one re-render carries the site. */
export function useVisitorClock(): VisitorClock | null {
  const [clock] = useLocalState<VisitorClock | null>(VISITOR_KEY, null);
  /* Apply before children render, so that pass already shows it. */
  setVisitorClock(clock);
  return clock;
}

/** Re-check the clock when the tab wakes up and the cached answer is stale —
    and confirm the address even when it is not, so a VPN taken mid-visit
    moves the time and money without a reload. A quarter-hour timer covers a
    page just sitting open. */
export function useVisitorClockRefresh() {
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      if (isStale(normalizeVisitorClock(readCached()))) {
        void refreshVisitorClock();
        return;
      }
      void recheckAddress();
    };
    const timer = window.setInterval(() => {
      void recheckAddress();
    }, 15 * 60 * 1000);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, []);
}
