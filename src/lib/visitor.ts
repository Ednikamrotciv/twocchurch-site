/* ============================================================================
   Which clock is the visitor sitting in front of, and what money do they read?

   Two things follow from the same answer — **where the visitor is**, worked out
   from their **IP address** (SPEC notes 85 and 98):

     * the times on the site, shown on the visitor's own clock, and
     * the money, shown in the visitor's own country's currency (converted from
       the church's, at the day's rate — src/lib/rates.ts).

   This module is the only place that asks, and it hands both back together:
   `{ tz, place, country, currency }`, kept in localStorage so a returning
   visitor reads the site in their own time and their own money on the very
   first frame.

   Why the lookup is a *direct* fetch() and not superFetch:

   - `superFetch` (super-fetch-plugin) sends the request from perchance's own
     server. That is exactly what we must NOT do here: the geolocation service
     would then see perchance's address and answer with *its* location, and
     every visitor on earth would be told they were in the same city. The
     browser's own `fetch` sends the request from the visitor's machine, so
     the service sees the visitor's address — which is the whole point.
   - Nothing else needs the proxy anyway: the services below are plain JSON
     endpoints that send `Access-Control-Allow-Origin: *`, so a cross-origin
     fetch is allowed.

   Each service is asked for everything at once, and the country is turned into
   a currency with the generated table in src/data/currencies.ts when the
   service does not name one itself. If every IP service is unreachable — no
   network, a blocker, a service outage — the visitor's *device* is asked
   instead (its clock's country first, its language region second), and failing
   even that the site stays on the church's clock and the church's currency,
   which is where it was before any of this existed.

   Nothing is sent anywhere but the address itself (which every request to any
   server already reveals), nothing is stored on a server, and the office can
   switch both halves off from the console (*Church profile → Show each visitor
   their own time zone / their own currency*) — in which case every reader gets
   the church's clock and the church's currency, and this lookup stops deciding
   anything.
   ========================================================================== */

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
import { countryOfTimezone } from "../data/currencies";

/** How long a found clock is trusted before it is looked up again. */
const FRESH_MS = 12 * 60 * 60 * 1000;
/** Give a service this long before moving on to the next one. */
const TIMEOUT_MS = 9000;

type Answer = { tz: string; place: string; country: string; currency: string };

type Probe = { url: string; read: (json: any, text: string) => Answer };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * The services to try, in order. Each is keyless, CORS-open and answers with an
 * IANA zone name; `read` pulls the zone, a place name and — where the service
 * knows it — the country and its currency out of whatever shape it replies in.
 * The first two answer with everything, which saves a lookup for the table.
 */
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

/** Ask the visitor's own device, used only when the IP services cannot answer. */
function deviceZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(tz) ? tz : "";
  } catch {
    return "";
  }
}

/**
 * The country the *device* is set to — first the region its clock lives in
 * ("Africa/Lagos" → "NG"), which follows the visitor even when their browser
 * language does not (an "en-US" browser in Lagos is still in Nigeria); then,
 * for a zone the table has never heard of, the region of the browser's own
 * language ("en-NG" → "NG"). A region-less language ("en") tells us nothing,
 * so the currency stays unknown rather than being guessed from the clock.
 */
function deviceCountry(tz: string): string {
  const fromZone = countryOfTimezone(tz);
  if (fromZone) return fromZone;
  try {
    const tags = [navigator.language, ...(navigator.languages || [])];
    for (const tag of tags) {
      if (typeof tag !== "string" || !tag) continue;
      const region = new Intl.Locale(tag).region;
      if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
    }
  } catch {
    /* no Intl.Locale on an old browser — the currency simply stays unknown */
  }
  return "";
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

/** The visitor's own device, when none of the IP services answered. */
function deviceClock(): VisitorClock | null {
  const tz = deviceZone();
  if (!tz) return null;
  const country = deviceCountry(tz);
  return { tz, place: "", country, currency: currencyOfCountry(country), source: "device", v: VISITOR_CLOCK_V, at: Date.now() };
}

/** Find the visitor's clock: their IP first, their device second, nothing third. */
export async function findVisitorClock(): Promise<VisitorClock | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  for (const probe of PROBES) {
    const answer = await ask(probe);
    if (answer) return ipClock(answer);
  }
  const local = await askLocalProxy();
  if (local) return ipClock(local);
  return deviceClock();
}

/**
 * Should we ask again? Yes when there is no answer to hand, when the one we have
 * is half a day old, or when it was found by an older version of the site and so
 * carries no country or currency (SPEC note 98).
 */
function isStale(clock: VisitorClock | null): boolean {
  if (!clock) return true;
  if (clock.v !== VISITOR_CLOCK_V) return true;
  return Date.now() - clock.at >= FRESH_MS;
}

let inFlight: Promise<VisitorClock | null> | null = null;

/**
 * Look the visitor up now and remember the answer. Safe to call as often as you
 * like: while one lookup is running, further calls share it.
 */
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

/**
 * Start the lookup once per page load, unless the clock we already have on this
 * device is still fresh. Called from the app's boot (src/App.tsx) — it never
 * blocks rendering: the site paints on the last known clock (or the church's)
 * and re-paints the moment the answer arrives.
 */
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

/**
 * The visitor's own clock, wired to React: reading it re-renders the page when
 * the answer arrives. Use it at the top of the tree (src/App.tsx) so one
 * re-render carries the whole site onto the new clock.
 */
export function useVisitorClock(): VisitorClock | null {
  const [clock] = useLocalState<VisitorClock | null>(VISITOR_KEY, null);
  /* Hand it to the store *before* the children below render, so the pass that
     the new value triggers is the pass that shows it — otherwise the first
     re-render would still read the old zone and nothing would trigger another.
     (The same value was already applied synchronously at module load, so this
     is only ever keeping them in step.) */
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
