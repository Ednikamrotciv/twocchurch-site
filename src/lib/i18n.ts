/* Visitor language from the IP country, with whole-site translation.
   The country (already found for the clock) names a language; every English
   line is then translated through a keyless endpoint, cached per language, and
   swapped in progressively. Anything untranslated stays English — the site
   never blanks and never blocks paint on it. */

import { useEffect, useState } from "react";

/** Two-letter country → Google translate code. Unmapped means English. */const LANG_OF: Record<string, string> = {
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

/** What each language calls itself — the popup offers it by this name. */
export const LANG_NAMES: Record<string, string> = {
  fr: "Français", de: "Deutsch", es: "Español", it: "Italiano", pt: "Português",
  nl: "Nederlands", ru: "Русский", uk: "Українська", pl: "Polski", tr: "Türkçe",
  ar: "العربية", so: "Soomaali", am: "አማርኛ", fa: "فارسی", ur: "اردو",
  hi: "हिन्दी", bn: "বাংলা", ne: "नेपाली", si: "සිංහල",
  "zh-CN": "简体中文", "zh-TW": "繁體中文", ja: "日本語", ko: "한국어",
  th: "ไทย", vi: "Tiếng Việt", id: "Bahasa Indonesia", ms: "Bahasa Melayu",
  tl: "Tagalog", my: "မြန်မာ", km: "ខ្មែរ", lo: "ລາວ", mn: "Монгол",
  ka: "ქართული", hy: "Հայերեն", az: "Azərbaycan", uz: "O'zbek",
  tg: "Тоҷикӣ", tk: "Türkmen", he: "עברית",
  sv: "Svenska", nb: "Norsk", da: "Dansk", fi: "Suomi", is: "Íslenska",
  el: "Ελληνικά", ro: "Română", hu: "Magyar", cs: "Čeština", sk: "Slovenčina",
  bg: "Български", hr: "Hrvatski", sr: "Српски", mk: "Македонски", sl: "Slovenščina",
  et: "Eesti", lv: "Latviešu", lt: "Lietuvių", sq: "Shqip", mt: "Malti",
};

/* ------------------------------------------------------- the visitor's pick */

/* A non-English IP is followed at once — the whole site moves onto their own
   language by itself (note 421). A small notice offers Keep English instead,
   and the pick survives reloads; "not now" only hides the notice until the
   next visit, keeping the IP language meanwhile. */
const CHOICE_KEY = "wom.i18n.choice";
const ASK_LATER_KEY = "wom.i18n.asklater";

let lastEntries: [string, string][] = [];
let needAsk = false;
let askLang = "";

function readChoice(): string | null {
  try {
    return localStorage.getItem(CHOICE_KEY);
  } catch {
    return null;
  }
}

function askLater(): boolean {
  try {
    return sessionStorage.getItem(ASK_LATER_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether the language question is showing, and for which language. */
export function i18nAsk(): { show: boolean; lang: string; name: string } {
  return { show: needAsk, lang: askLang, name: LANG_NAMES[askLang] || askLang };
}

/** The visitor picked a language — remember it and move the whole site over. */
export function chooseLang(l: string): void {
  try {
    localStorage.setItem(CHOICE_KEY, l);
  } catch {
    /* private mode — the pick holds for this visit */
  }
  try {
    sessionStorage.removeItem(ASK_LATER_KEY);
  } catch {
    /* session-only nicety */
  }
  needAsk = false;
  askLang = "";
  void runFor(l, lastEntries);
}

/** Hide the notice until the next visit (the IP language stays meanwhile). */
export function dismissAsk(): void {
  try {
    sessionStorage.setItem(ASK_LATER_KEY, "1");
  } catch {
    /* session-only nicety */
  }
  needAsk = false;
  askLang = "";
  bump();
}

type Hit = { s: string; t: string };

let lang = "en";
let table: Record<string, Hit> = {};
let runningFor = "";
let runToken = 0;

const listeners = new Set<() => void>();
function bump() {
  tickN += 1;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* one tearing listener must not stop the rest */
    }
  });
}

/** Counts every repaint broadcast — paint caches (box faces) key on it. */
let tickN = 0;
export function i18nTickN(): number {
  return tickN;
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

/* The one value that always stays as the office typed it: the church's full
   legal name ("The World Overcomers' Ministries Inc.", note 421). It rides
   masked (see tokenize) so the prose around it still converts and the name is
   restored byte-identical — only this name is exempt, everything else follows
   the visitor's IP language. Set once the site's own data is known (see App). */
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
    }
  }
  /* Longest first, so a short keeper can never cut a longer one in half. */
  keepers.sort((a, b) => b.length - a.length);
}

/** True only when the whole line IS the kept name on its own (note 421) —
    a lone name needs no request (translation would return it unchanged).
    Anything longer rides masked (see tokenize) so the prose around the name
    still converts while the name is restored byte-identical. */
function isProtected(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  const low = t.toLowerCase();
  for (const k of keepers) {
    if (k.length >= 3 && low === k.toLowerCase()) return true;
  }
  return false;
}

/** Worth sending: has letters and is not a link of its own. Kept names ride
    masked (see tokenize), so only a lone name is skipped — every longer line
    converts around its intact name (note 421). Long texts travel in pieces
    (see splitPieces) instead of staying English. */
function worthTranslating(text: string): boolean {
  const t = String(text || "");
  if (t.length < 2 || t.length > 8000) return false;
  if (/^(https?:|mailto:|tel:|data:|blob:|#)/i.test(t.trim())) return false;
  if (isProtected(t)) return false;
  return /[A-Za-zÀ-ÿĀ-ž]/.test(t);
}

const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const URL_RE = /https?:\/\/[^\s<>"')]+/g;

/** Escape a literal for a case-insensitive search pattern. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Hide {{placeholders}}, the kept legal name, email addresses and links from
    translation under hard tokens, restored after — the name and the address
    survive byte-identical while the prose around them converts (note 421).
    Tokens hold no spaces or punctuation, so piece splits can never cut one
    in half. */
function tokenize(text: string): { masked: string; vars: string[] } {
  const vars: string[] = [];
  const push = (m: string) => {
    vars.push(m);
    return `__WOM${vars.length - 1}__`;
  };
  let masked = String(text).replace(/\{\{\w+\}\}/g, push).replace(URL_RE, push).replace(EMAIL_RE, push);
  for (const k of keepers) {
    if (k.length < 3) continue;
    const re = new RegExp(escapeRe(k), "gi");
    masked = masked.replace(re, push);
  }
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

/** Split masked text into translatable pieces that never cut a token: tokens
    hold no spaces or sentence punctuation, so sentence splits and space-backed
    hard splits are both safe (note 225). */
function splitPieces(masked: string, max = 1000): string[] {
  if (masked.length <= 1200) return [masked];
  const out: string[] = [];
  let cur = "";
  for (const s of masked.split(/(?<=[.!?]\s|\n)/)) {
    if (cur && cur.length + s.length > max) {
      out.push(cur);
      cur = "";
    }
    cur += s;
  }
  if (cur) out.push(cur);
  return out.flatMap((p) => {
    if (p.length <= 1200) return [p];
    const bits: string[] = [];
    let rest = p;
    while (rest.length > 1000) {
      let cut = rest.lastIndexOf(" ", 1000);
      if (cut < 400) cut = 1000;
      bits.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^\s+/, "");
    }
    if (rest) bits.push(rest);
    return bits;
  });
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
 *
 * The IP language applies by itself — like the IP clock and the IP currency
 * already do (notes 85, 98): a stored pick is honored silently, otherwise the
 * site moves onto the IP language at once and a small notice offers Keep
 * English (persisted) or Not now (hides for this visit, note 421).
 */
export async function ensureI18n(country: string, entries: [string, string][]): Promise<void> {
  lastEntries = entries;
  const l = langForCountry(country);
  const saved = readChoice();
  if (l === "en" || saved === "en") {
    needAsk = false;
    askLang = "";
    await runFor("en", entries);
    return;
  }
  if (saved && saved === l) {
    needAsk = false;
    askLang = "";
    await runFor(l, entries);
    return;
  }
  /* No pick yet: follow the IP language at once and ask about it — the notice
     is an opt-out (Keep English), never a gate holding the site in English. */
  if (!askLater()) {
    needAsk = true;
    askLang = l;
  }
  await runFor(l, entries);
}

/** Drive the site onto one language (the shared body behind ask + answer). */
async function runFor(l: string, entries: [string, string][]): Promise<void> {
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
  type Unit = { id: string; source: string; vars: string[]; piece: string; idx: number; total: number };
  const units: Unit[] = [];
  for (const [id, text] of missing) {
    const { masked, vars } = tokenize(text);
    /* Multi-line lines ride newline-masked (like the dynamic batches) so the
       batch's line count survives them; long lines ride in pieces (note 225). */
    const safe = masked.split("\n").join(NL_TOKEN);
    splitPieces(safe).forEach((piece, idx, arr) =>
      units.push({ id, source: text, vars, piece, idx, total: arr.length })
    );
  }
  const batches: Unit[][] = [];
  let cur: Unit[] = [];
  let chars = 0;
  for (const u of units) {
    if (cur.length >= 25 || chars + u.piece.length > 1400) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(u);
    chars += u.piece.length;
  }
  if (cur.length) batches.push(cur);
  /* Translated pieces per line, in order; a line applies once all its pieces
     have landed, so a piece split across two batches still joins correctly. */
  const got = new Map<string, { source: string; vars: string[]; parts: (string | null)[]; total: number }>();
  const bank = (u: Unit, text: string | null) => {
    let g = got.get(u.id);
    if (!g) {
      g = { source: u.source, vars: u.vars, parts: new Array(u.total).fill(null), total: u.total };
      got.set(u.id, g);
    }
    if (text) g.parts[u.idx] = text;
  };
  const applyReady = () => {
    let applied = 0;
    for (const [id, g] of got) {
      if (g.parts.some((p) => !p)) continue;
      const joined = g.parts.join("").split(NL_TOKEN).join("\n");
      const restored = restore(joined, g.vars);
      got.delete(id);
      if (!restored || restored === g.source) continue;
      table[id] = { s: g.source, t: restored };
      applied++;
    }
    if (applied) saveCache(l);
    return applied;
  };
  let lastBump = 0;
  const maybeBump = () => {
    const now = Date.now();
    if (now - lastBump > 400) {
      lastBump = now;
      bump();
    }
  };
  for (const batch of batches) {
    if (token !== runToken || lang !== l) return;
    const out = await translateLines(l, batch.map((u) => u.piece));
    if (token !== runToken || lang !== l) return;
    out.forEach((t, i) => bank(batch[i], t && t.trim() ? t : null));
    if (applyReady()) maybeBump();
    await new Promise((r) => window.setTimeout(r, 350));
  }
  /* One solo attempt each for whatever the batches mangled — a line alone
     often survives where a batch does not (note 225). Bounded: thirty lines. */
  const leftover = missing.filter(([id, text]) => {
    const hit = table[id];
    return !hit || hit.s !== text;
  }).slice(0, 30);
  for (const [id, text] of leftover) {
    if (token !== runToken || lang !== l) return;
    const { masked, vars } = tokenize(text);
    const pieces = splitPieces(masked.split("\n").join(NL_TOKEN));
    const out = await translateLines(l, pieces);
    if (token !== runToken || lang !== l) return;
    if (out.some((p) => !p || !p.trim())) continue;
    const restored = restore(out.join("").split(NL_TOKEN).join("\n"), vars);
    if (!restored || restored === text) continue;
    table[id] = { s: text, t: restored };
    saveCache(l);
    maybeBump();
    await new Promise((r) => window.setTimeout(r, 350));
  }
  if (token === runToken && lang === l) bump();
  runningFor = "";
}

/**
 * Translate a lone string — countdown units, day names, sermon titles,
 * testimony bodies: any page text that is data rather than a copy line.
 * English now; the translation lands in the cache and repaints when it
 * arrives. Requests are micro-batched (one per burst, newline-joined like the
 * copy batches) instead of one per string.
 */
const dynPending = new Map<string, string>();
let dynTimer = 0;

/** Queue one string for the micro-batch; a queued line is asked once. */
function queueDyn(id: string, source: string) {
  if (dynPending.has(id)) return;
  const hit = table[id];
  if (hit && hit.s === source) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  dynPending.set(id, source);
  if (!dynTimer && typeof window !== "undefined") {
    dynTimer = window.setTimeout(() => void flushDyn(), 700);
  }
}

export function tx(word: string): string {
  const w = String(word || "");
  if (lang === "en" || !worthTranslating(w)) return w;
  const { masked, vars } = tokenize(w);
  if (masked === w) {
    /* No placeholders, emails or links: today's path, byte-identical. */
    const id = `w:${w}`;
    const hit = table[id];
    if (hit && hit.s === w) return hit.t;
    queueDyn(id, w);
    return w;
  }
  /* Masked text travels in pieces (long or token-carrying alike); each piece
     is cached on its masked form and the join is unmasked once (note 225). */
  let joined = "";
  for (const piece of splitPieces(masked)) {
    const pid = `w:${piece}`;
    const hit = table[pid];
    if (hit && hit.s === piece) joined += hit.t;
    else {
      queueDyn(pid, piece);
      joined += piece;
    }
  }
  return restore(joined, vars) ?? w;
}

/* Newlines ride masked (batches are newline-joined) and come back after. */
const NL_TOKEN = "__WOMNL__";

async function flushDyn(): Promise<void> {
  dynTimer = 0;
  if (lang === "en" || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    if (lang === "en") dynPending.clear();
    else if (typeof window !== "undefined") dynTimer = window.setTimeout(() => void flushDyn(), 5000);
    return;
  }
  const batch = [...dynPending.entries()];
  dynPending.clear();
  if (!batch.length) return;
  const l = lang;
  const chunks: [string, string][][] = [];
  let cur: [string, string][] = [];
  let chars = 0;
  for (const [id, source] of batch) {
    const masked = tokenize(source).masked.split("\n").join(NL_TOKEN);
    if (cur.length >= 25 || chars + masked.length > 1400) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push([id, source]);
    chars += masked.length;
  }
  if (cur.length) chunks.push(cur);
  for (const chunk of chunks) {
    if (lang !== l) return;
    const masked = chunk.map(([, source]) => tokenize(source).masked.split("\n").join(NL_TOKEN));
    const out = await translateLines(l, masked);
    if (lang !== l) return;
    let applied = 0;
    out.forEach((t, i) => {
      if (!t) return;
      const [id, source] = chunk[i];
      const withBreaks = t.split(NL_TOKEN).join("\n");
      const restored = restore(withBreaks, tokenize(source).vars);
      if (!restored || restored === source) return;
      table[id] = { s: source, t: restored };
      applied++;
    });
    if (applied) {
      saveCache(l);
      bump();
    }
    await new Promise((r) => window.setTimeout(r, 350));
  }
}
