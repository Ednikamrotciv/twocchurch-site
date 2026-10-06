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
  type VisitorClock,
} from "./store";

/** How long a found clock is trusted before it is looked up again. */
const FRESH_MS = 12 * 60 * 60 * 1000;
/** Give a service this long before moving on to the next one. */
const TIMEOUT_MS = 9000;

type Answer = { tz: string; place: string; country: string; currency: string };

type Probe = { url: string; read: (json: any, text: string) => Answer };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Keyless CORS-open services, tried in order; first answer wins. */
const PROBES: Probe[] = [
  {
    /* Asked first: generous keyless limits and rarely blocked, city included.
       No currency in the answer — the country table covers that. */
    url: "https://get.geojs.io/v1/ip/geo.json",
    read: (json) => ({ tz: str(json?.timezone), place: str(json?.city), country: str(json?.country_code), currency: "" }),
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
    return answer && answer.tz && isValidTimezone(answer.tz) ? answer : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function isLocalHost(): boolean {
  try {
    const h = window.location.hostname.toLowerCase();
    if (!h || h === "localhost") return true;
    if (h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.startsWith("127.")) return true;
    if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
    if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  } catch {
    return false;
  }
  return false;
}

async function askLocalProxy(): Promise<Answer | null> {
  if (!isLocalHost()) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/__geo", { signal: controller.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) return null;
    const json = await res.json();
    const answer = { tz: str(json?.tz), place: str(json?.place), country: str(json?.country), currency: str(json?.currency) };
    return answer.tz && isValidTimezone(answer.tz) ? answer : null;
  } catch {
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
    source: "ip",
    v: VISITOR_CLOCK_V,
    at: Date.now(),
  };
}

/** Find the visitor's clock from their IP address only. `null` when the IP
    services cannot answer — callers fall back to the church's own clock. */
export async function findVisitorClock(): Promise<VisitorClock | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  for (const probe of PROBES) {
    const answer = await ask(probe);
    if (answer) return ipClock(answer);
  }
  const local = await askLocalProxy();
  if (local) return ipClock(local);
  return null;
}

/** Re-ask when missing, half a day old, or predating country/currency (note 98). */
function isStale(clock: VisitorClock | null): boolean {
  if (!clock) return true;
  if (clock.v !== VISITOR_CLOCK_V) return true;
  return Date.now() - clock.at >= FRESH_MS;
}

let inFlight: Promise<VisitorClock | null> | null = null;

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

/** Start one lookup per load (never blocks paint). */
export function startVisitorClock() {
  if (started) return;
  started = true;
  if (!isStale(normalizeVisitorClock(readCached()))) return;
  void refreshVisitorClock();
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

/** Re-check the clock when the tab wakes up and the cached answer is stale. */
export function useVisitorClockRefresh() {
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      if (isStale(normalizeVisitorClock(readCached()))) void refreshVisitorClock();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    };
  }, []);
}
