/* Visitor language from the IP country, with whole-site translation.
   The country (already found for the clock) names a language; every English
   line is then translated through a keyless endpoint, cached per language, and
   swapped in progressively. Anything untranslated stays English — the site
   never blanks and never blocks paint on it. */

import { useEffect, useState } from "react";

/** Two-letter country → Google translate code. Unmapped means English. */
const LANG_OF: Record<string, string> = {
  FR: "fr", BE: "fr", LU: "fr", MC: "fr", CM: "fr", SN: "fr", CI: "fr", ML: "fr",
  BF: "fr", NE: "fr", GN: "fr", TD: "fr", CG: "fr", CD: "fr", RW: "fr", BI: "fr",
  DJ: "fr", MG: "fr", HT: "fr", GF: "fr",
  DE: "de", AT: "de", CH: "de", LI: "de",
  ES: "es", MX: "es", AR: "es", CO: "es", PE: "es", VE: "es", CL: "es", UY: "es",
  PY: "es", BO: "es", EC: "es", GT: "es", HN: "es", SV: "es", NI: "es", CR: "es",
  PA: "es", DO: "es", CU: "es", PR: "es", GQ: "es",
  IT: "it", SM: "it", VA: "it",
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt", CV: "pt", GW: "pt", ST: "pt", TL: "pt",
  NL: "nl", RU: "ru", BY: "ru", KZ: "ru", KG: "ru",
  UA: "uk", PL: "pl", TR: "tr",
  SA: "ar", EG: "ar", DZ: "ar", MA: "ar", TN: "ar", LY: "ar", SD: "ar", IQ: "ar",
  JO: "ar", LB: "ar", SY: "ar", YE: "ar", OM: "ar", QA: "ar", KW: "ar", BH: "ar",
  AE: "ar", MR: "ar", SO: "so", ET: "am",
  IR: "fa", AF: "fa", PK: "ur", IN: "hi", BD: "bn", NP: "ne", LK: "si",
  CN: "zh-CN", TW: "zh-TW", HK: "zh-TW",
  JP: "ja", KR: "ko", TH: "th", VN: "vi", ID: "id", MY: "ms", PH: "tl",
  MM: "my", KH: "km", LA: "lo", MN: "mn", GE: "ka", AM: "hy", AZ: "az",
  UZ: "uz", TJ: "tg", TM: "tk",
  IL: "he", PS: "ar",
  SE: "sv", NO: "nb", DK: "da", FI: "fi", IS: "is",
  GR: "el", CY: "el", RO: "ro", HU: "hu", CZ: "cs", SK: "sk", BG: "bg",
  HR: "hr", RS: "sr", BA: "sr", ME: "sr", MK: "mk", SI: "sl",
  EE: "et", LV: "lv", LT: "lt", AL: "sq", MT: "mt",
};

/** The site language for an IP country — English unless mapped above. */
export function langForCountry(country: string): string {
  return LANG_OF[String(country || "").trim().toUpperCase()] || "en";
}

type Hit = { s: string; t: string };

let lang = "en";
let table: Record<string, Hit> = {};
let runningFor = "";
let runToken = 0;

const listeners = new Set<() => void>();
function bump() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* one tearing listener must not stop the rest */
    }
  });
}

/** Repaint the tree when translated lines land. Mount once, near the root. */
export function useI18nTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    const fn = () => setN((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
}

export function currentLang(): string {
  return lang;
}

/**
 * Translated text for one resolved copy value — or null when the site reads
 * English or this line has none yet (callers show the English meanwhile).
 */
export function translatedText(id: string, source: string): string | null {
  if (lang === "en") return null;
  const hit = table[id];
  if (hit && hit.s === source) return hit.t;
  return null;
}

/* ------------------------------------------------------------------ keepers */

/* Values that always stay as the office typed them: the church's name, its
   addresses and its emails are identity, not prose — translating them would
   misdirect visitors (a translated street name no map can find). Set once the
   site's own data is known (see App); every check below runs against them. */
let keepers: string[] = [];

export function setProtectedValues(values: (string | undefined | null)[]): void {
  keepers = [];
  const seen = new Set<string>();
  for (const v of values) {
    const t = String(v || "").trim();
    if (t.length < 3) continue;
    const low = t.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      keepers.push(t);
      /* The mail domain on its own is identity too ("visit worldovercomers.org"). */
      const at = t.indexOf("@");
      if (at > 0 && /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(t)) {
        const domain = t.slice(at + 1).toLowerCase();
        if (!seen.has(domain)) {
          seen.add(domain);
          keepers.push(t.slice(at + 1));
        }
      }
    }
  }
  /* New keepers can unseat old translations — drop any cached line holding one. */
  if (lang !== "en") {
    let changed = false;
    for (const id of Object.keys(table)) {
      const hit = table[id];
      if (hit && isProtected(hit.s)) {
        delete table[id];
        changed = true;
      }
    }
    if (changed) {
      saveCache(lang);
      bump();
    }
  }
}

/** True when a line carries an email address of its own. */
function hasEmail(text: string): boolean {
  return /[\w.+-]+@[\w-]+(\.[\w-]+)+/.test(String(text || ""));
}

/** True when a line carries one of the office's kept values (name/address/email). */
function isProtected(text: string): boolean {
  const t = String(text || "");
  if (!t) return false;
  if (hasEmail(t)) return true;
  const low = t.toLowerCase();
  for (const k of keepers) {
    if (k.length >= 3 && low.includes(k.toLowerCase())) return true;
  }
  return false;
}

/** Worth sending: has letters, is not an address of its own, holds nothing kept. */
function worthTranslating(text: string): boolean {
  const t = String(text || "");
  if (t.length < 2 || t.length > 1200) return false;
  if (/^(https?:|mailto:|tel:|data:|blob:|#)/i.test(t.trim())) return false;
  /* The church's name, addresses and emails never convert — only prose does. */
  if (isProtected(t)) return false;
  return /[A-Za-zÀ-ÿĀ-ž]/.test(t);
}

/** Hide {{placeholders}} from translation under hard tokens, restored after. */
function tokenize(text: string): { masked: string; vars: string[] } {
  const vars: string[] = [];
  const masked = String(text).replace(/\{\{\w+\}\}/g, (m) => {
    vars.push(m);
    return `__WOM${vars.length - 1}__`;
  });
  return { masked, vars };
}

function restore(translated: string, vars: string[]): string | null {
  let out = translated;
  for (let i = 0; i < vars.length; i++) {
    if (!out.includes(`__WOM${i}__`)) return null;
    out = out.split(`__WOM${i}__`).join(vars[i]);
  }
  return out;
}

function cacheKey(l: string): string {
  /* v2: keeper lines (name/address/email) are never translated — stale caches
     that may hold converted ones are dropped outright. */
  return `wom.i18n.v2.${l}`;
}

function loadCache(l: string): Record<string, Hit> {
  try {
    const raw = localStorage.getItem(cacheKey(l));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(l: string) {
  try {
    localStorage.setItem(cacheKey(l), JSON.stringify(table));
  } catch {
    /* private mode — the session table still translates this visit */
  }
}

/** One request through the keyless endpoint; the lines ride joined by newlines
    (only the first `q` is answered, so they travel as one). Nulls on failure. */
async function translateLines(l: string, texts: string[]): Promise<(string | null)[]> {
  const fail = texts.map(() => null);
  const joined = texts.join("\n");
  if (!joined.trim()) return fail;
  try {
    const u = new URL("https://translate.googleapis.com/translate_a/single");
    u.searchParams.set("client", "gtx");
    u.searchParams.set("sl", "en");
    u.searchParams.set("tl", l);
    u.searchParams.set("dt", "t");
    u.searchParams.set("q", joined);
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 20000);
    let data: any;
    try {
      const res = await fetch(u.toString(), { signal: ctrl.signal, credentials: "omit" });
      if (!res.ok) return fail;
      data = await res.json();
    } finally {
      window.clearTimeout(timer);
    }
    const segs = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : null;
    if (!segs) return fail;
    const out = segs.map((s: any) => (Array.isArray(s) ? String(s[0] ?? "") : "")).join("");
    const parts = out.split("\n");
    /* Translation must preserve the line count — a merged or split batch is
       discarded whole rather than misassigned line by line. */
    if (parts.length !== texts.length) return fail;
    return parts.map((p) => (p.trim() ? p : null));
  } catch {
    return fail;
  }
}

/**
 * Move the site onto a country's language. `entries` are the current
 * [id, resolved text] pairs; only missing or changed lines travel.
 */
export async function ensureI18n(country: string, entries: [string, string][]): Promise<void> {
  const l = langForCountry(country);
  const token = ++runToken;
  lang = l;
  table = l === "en" ? {} : loadCache(l);
  runningFor = l;
  bump();
  if (l === "en" || typeof navigator !== "undefined" && navigator.onLine === false) {
    runningFor = "";
    return;
  }
  const missing = entries.filter(([id, text]) => {
    const hit = table[id];
    return worthTranslating(text) && (!hit || hit.s !== text);
  });
  if (!missing.length) {
    runningFor = "";
    return;
  }
  /* Small sequential batches, gently spaced — one failure never stops the rest. */
  const batches: [string, string][][] = [];
  let cur: [string, string][] = [];
  let chars = 0;
  for (const [id, text] of missing) {
    const { masked } = tokenize(text);
    if (cur.length >= 25 || chars + masked.length > 1400) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push([id, text]);
    chars += masked.length;
  }
  if (cur.length) batches.push(cur);
  let lastBump = 0;
  for (const batch of batches) {
    if (token !== runToken || lang !== l) return;
    const masked = batch.map(([, text]) => tokenize(text).masked);
    const out = await translateLines(l, masked);
    if (token !== runToken || lang !== l) return;
    let applied = 0;
    out.forEach((t, i) => {
      if (!t) return;
      const [id, source] = batch[i];
      const { vars } = tokenize(source);
      const restored = restore(t, vars);
      if (!restored || restored === source) return;
      table[id] = { s: source, t: restored };
      applied++;
    });
    if (applied) {
      saveCache(l);
      const now = Date.now();
      if (now - lastBump > 400) {
        lastBump = now;
        bump();
      }
    }
    await new Promise((r) => window.setTimeout(r, 350));
  }
  if (token === runToken && lang === l) bump();
  runningFor = "";
}

/**
 * Translate a lone word (countdown units, day names). English now; the
 * translation lands in the cache and repaints when it arrives.
 */
const wordQueue = new Map<string, Promise<void>>();
export function tx(word: string): string {
  const w = String(word || "");
  if (lang === "en" || !worthTranslating(w)) return w;
  const id = `w:${w}`;
  const hit = table[id];
  if (hit && hit.s === w) return hit.t;
  if (!wordQueue.has(id) && (typeof navigator === "undefined" || navigator.onLine !== false)) {
    const job = translateLines(lang, [w])
      .then(([t]) => {
        if (t && t !== w) {
          table[id] = { s: w, t };
          saveCache(lang);
          bump();
        }
      })
      .catch(() => {})
      .then(() => {
        wordQueue.delete(id);
      });
    wordQueue.set(id, job);
  }
  return w;
}
