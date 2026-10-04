/* Exchange rates: church currency to visitor currency (note 98).
   Fetched in-browser from free keyless feeds, cached half a day;
   falls back to the dated snapshot in data/currencies.ts. */

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

async function askLocalProxy(): Promise<FxRates | null> {
  if (!isLocalHost()) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/__rates", { signal: controller.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) return null;
    const rates = numbers((await res.json())?.rates ?? {});
    if (!rates.USD || Object.keys(rates).length < MIN_ENTRIES) return null;
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
  return askLocalProxy();
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

/** Start the lookup once per page load, only when there is something to convert. */
export function startRates() {
  if (started || !ratesNeeded()) return;
  started = true;
  if (getRates().source === "live" && Date.now() - getRates().at < FRESH_MS) return;
  void refreshRates();
}

/** The rates, wired to React: the page re-renders when a fresh fetch lands. */
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
