/* ============================================================================
   What is the church's dollar worth to this visitor?

   The site's money is written in the church's own currency and read in the
   visitor's, which is the currency of the country their IP address is in
   (src/lib/visitor.ts). Turning one into the other needs a rate, and this
   module is where it comes from (SPEC note 98).

   The rate is fetched by the visitor's *own browser*, from a free, keyless,
   CORS-open feed, kept in localStorage (`wom.fxRates`, key `KEYS.rates`) for
   half a day, and re-checked quietly after that or when the tab wakes up. A
   reader whose own currency is the church's gets nothing to convert, so we do
   not ask for a rate at all (see `startRates`).

   Nothing here is needed to *render* the site: the figures are in hand before
   any rate is. If every feed is unreachable — offline, a content blocker, an
   outage — the dated snapshot that ships with the site is used instead
   (`FALLBACK_RATES` in src/data/currencies.ts), so the amounts are still the
   right shape, only as old as that snapshot's date.

   Two feeds are tried in turn, the second of which is a mirror of the first on
   a different CDN; the third is an entirely separate provider, so one company's
   outage cannot leave the site without rates while the browser is online.
   ========================================================================== */

import { useEffect } from "react";
import { useLocalState, writeStore } from "./hooks";
import { RATES_KEY, baseCurrency, getRates, setRates, visitorCurrency, visitorCurrencyEnabled, type FxRates } from "./store";

/** How long fetched rates are trusted before they are fetched again. */
const FRESH_MS = 12 * 60 * 60 * 1000;
/** Give a feed this long before moving on to the next one. */
const TIMEOUT_MS = 9000;
/** A feed that answers with fewer than this many currencies is not a rate table. */
const MIN_ENTRIES = 40;

type Feed = { url: string; read: (json: any) => Record<string, number> | null };

/** Keep only the entries that are really "1 US dollar buys this much". */
function numbers(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, value] of Object.entries(raw)) {
    const key = String(code).trim().toUpperCase();
    const n = Number(value);
    if (/^[A-Z]{3}$/.test(key) && Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

const FEEDS: Feed[] = [
  {
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    read: (json) => (json && json.usd && typeof json.usd === "object" ? numbers(json.usd) : null),
  },
  {
    /* The same feed's own CDN, in case the first is unreachable. */
    url: "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
    read: (json) => (json && json.usd && typeof json.usd === "object" ? numbers(json.usd) : null),
  },
  {
    /* A different provider altogether, quoted the other way up. */
    url: "https://open.er-api.com/v6/latest/USD",
    read: (json) => (json && json.rates && typeof json.rates === "object" ? numbers(json.rates) : null),
  },
];

async function ask(feed: Feed): Promise<FxRates | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, { signal: controller.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) return null;
    const rates = feed.read(await res.json());
    if (!rates || !rates.USD || Object.keys(rates).length < MIN_ENTRIES) return null;
    return { base: "USD", rates, at: Date.now(), source: "live" };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Ask the feeds, in turn, for today's rates. `null` when none of them answer. */
export async function findRates(): Promise<FxRates | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  for (const feed of FEEDS) {
    const rates = await ask(feed);
    if (rates) return rates;
  }
  return null;
}

let inFlight: Promise<FxRates | null> | null = null;

/**
 * Fetch and remember the rates. Safe to call as often as you like: while one
 * lookup is running, further calls share it.
 */
export function refreshRates(): Promise<FxRates | null> {
  if (inFlight) return inFlight;
  inFlight = findRates()
    .then((rates) => {
      /* Both halves matter: the module copy is what `fmtMoney` reads, and the
         localStorage write is what tells the mounted React tree to paint again
         (see `useRates`). */
      if (rates) {
        setRates(rates);
        writeStore(RATES_KEY, rates);
      }
      return rates;
    })
    .catch(() => null)
    .then((rates) => {
      inFlight = null;
      return rates;
    });
  return inFlight;
}

let started = false;

/**
 * Is there anything for a rate to do for this reader? Their own currency, when
 * we know it, and it is not the church's.
 */
function ratesNeeded(): boolean {
  const own = visitorCurrency();
  return visitorCurrencyEnabled() && !!own && own !== baseCurrency();
}

/**
 * Start the lookup once per page load — but only when there is something to
 * convert: a reader whose own currency is the church's never needs a rate, and
 * is never made to wait for one. Called from the app's boot (src/App.tsx), and
 * again when the visitor's clock arrives, since until then we cannot know.
 */
export function startRates() {
  if (started || !ratesNeeded()) return;
  started = true;
  if (getRates().source === "live" && Date.now() - getRates().at < FRESH_MS) return;
  void refreshRates();
}

/**
 * The rates, wired to React: reading them re-renders the page when a fresh
 * fetch lands, so the money on it moves onto today's rate in one pass. Mount it
 * at the top of the tree (src/App.tsx).
 */
export function useRates(): FxRates {
  const [rates] = useLocalState<FxRates | null>(RATES_KEY, null);
  setRates(rates);
  return getRates();
}

/** Re-check the rates when the tab wakes up and the ones in hand are stale. */
export function useRatesRefresh() {
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState !== "visible" || !ratesNeeded()) return;
      const rates = getRates();
      if (rates.source !== "live" || Date.now() - rates.at >= FRESH_MS) void refreshRates();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    };
  }, []);
}
