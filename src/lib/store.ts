import { fireToast } from "./hooks";
import { ct } from "../data/copy";
import { LIVE } from "../data/live";
import { liveEndedAt, liveNow } from "./livestatus";
import { COUNTRY_CURRENCY, FALLBACK_RATES } from "../data/currencies";

export const KEYS = {
  theme: "wom.theme",
  branch: "wom.branch",
  prayers: "wom.prayers",
  wall: "wom.wall",
  testimonies: "wom.testimonies",
  saved: "wom.savedSermons",
  watched: "wom.watchedSermons",
  notes: "wom.sermonNotes",
  giving: "wom.givingLog",
  newsletter: "wom.newsletter",
  reading: "wom.readingPlan",
  visit: "wom.visitPlan",
  recent: "wom.recentSearches",
  filters: "wom.sermonFilters",
  notices: "wom.noticesDismissed",
  /** Where the visitor's own clock was found (their IP, or their device). */
  visitor: "wom.visitorClock",
  /** The exchange rates the site last fetched (src/lib/rates.ts). */
  rates: "wom.fxRates",
} as const;

/* ---------------- time ---------------- */

/* Two clocks (notes 84, 85): the church's own (`churchTimezone`, default Africa/Lagos,
   what the church writes down) and the visitor's (from IP; what times show in).
   `siteTimezone()` picks; branches compute in their own zone, show in the reader's. */

/** Home clock. Override with `churchTimezone` in main.pjs, or in the console. */
export const DEFAULT_TIMEZONE = "Africa/Lagos";

const ZONE_CACHE = new Map<string, Intl.DateTimeFormat>();
const ZONE_VALID = new Map<string, boolean>();

/** Is this a time zone the browser actually knows (e.g. "Africa/Lagos")? */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz.trim()) return false;
  const key = tz.trim();
  let ok = ZONE_VALID.get(key);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: key });
      ok = true;
    } catch {
      ok = false;
    }
    ZONE_VALID.set(key, ok);
  }
  return ok;
}

let configuredZone = "";

/** The church profile's time zone; re-read when the profile changes. */
export function setChurchTimezone(tz: unknown) {
  if (isValidTimezone(tz)) configuredZone = (tz as string).trim();
}

/** The church's own clock — Lagos, Nigeria unless the profile says otherwise. */
export function churchTimezone(): string {
  if (configuredZone) return configuredZone;
  const global = (globalThis as any).churchTimezone;
  const raw = typeof global === "string" ? global : global && typeof global.evaluateItem === "string" ? global.evaluateItem : "";
  return isValidTimezone(raw) ? (raw as string).trim() : DEFAULT_TIMEZONE;
}

/** Visitor clock from IP, cached with its place name (notes 84, 85). */

export type VisitorClock = {
  /** The IANA zone, e.g. "America/Chicago". */
  tz: string;
  /** The city the IP is registered to, e.g. "Dallas". Empty when unknown. */
  place: string;
  /** The country the IP is registered in, e.g. "NG". Empty when unknown. */
  country: string;
  /** The currency that country uses, e.g. "NGN". Empty when unknown. */
  currency: string;
  /** Where the answer came from: their network, or their device as a fallback. */
  source: "ip" | "device";
  /** Which shape of answer this is — an older one is looked up again. */
  v: number;
  /** When it was found (ms). */
  at: number;
};

/** localStorage key. Also the key the React hook watches (src/lib/visitor.ts). */
export const VISITOR_KEY = KEYS.visitor;

/** Lookup answer shape; bumped when it carries something new (note 98).
    v5: IP address is the only source — older cached answers are looked up again. */
export const VISITOR_CLOCK_V = 5;

export function normalizeVisitorClock(raw: any): VisitorClock | null {
  if (!raw || typeof raw !== "object") return null;
  const tz = isValidTimezone(raw.tz) ? String(raw.tz).trim() : "";
  if (!tz) return null;
  const country = typeof raw.country === "string" && /^[A-Za-z]{2}$/.test(raw.country.trim()) ? raw.country.trim().toUpperCase() : "";
  return {
    tz,
    place: typeof raw.place === "string" ? raw.place.trim() : "",
    country,
    currency: isValidCurrency(raw.currency) ? String(raw.currency).trim().toUpperCase() : "",
    source: raw.source === "device" ? "device" : "ip",
    v: Number(raw.v) || 0,
    at: Number(raw.at) || 0,
  };
}

function readStoredVisitorClock(): VisitorClock | null {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    return raw ? normalizeVisitorClock(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

let visitorClock: VisitorClock | null = readStoredVisitorClock();

/** Record (or clear) the visitor's own clock. */
export function setVisitorClock(clock: unknown) {
  visitorClock = normalizeVisitorClock(clock);
}

export function getVisitorClock(): VisitorClock | null {
  return visitorClock;
}

/** The visitor's own zone, or "" when we have not been able to find it. */
export function visitorTimezone(): string {
  return visitorClock ? visitorClock.tz : "";
}

/** The place the visitor's clock was found in, e.g. "Dallas". */
export function visitorPlace(): string {
  return visitorClock ? visitorClock.place : "";
}

/** The country the visitor's IP is registered in, e.g. "NG". "" when unknown. */
export function visitorCountry(): string {
  return visitorClock ? visitorClock.country : "";
}

/** The currency the visitor's country uses, e.g. "NGN". "" when unknown. */
export function visitorCurrency(): string {
  return visitorClock ? visitorClock.currency : "";
}

/** Visitor currency allowed? Off puts every reader on the church's currency. */
let visitorMoneyOn = true;
export function setVisitorCurrencyEnabled(on: unknown) {
  visitorMoneyOn = on !== false;
}
export function visitorCurrencyEnabled(): boolean {
  return visitorMoneyOn;
}

/** Visitor time allowed? Off puts every reader on the church's clock. */
let visitorTimeOn = true;
export function setVisitorTimeEnabled(on: unknown) {
  visitorTimeOn = on !== false;
}
export function visitorTimeEnabled(): boolean {
  return visitorTimeOn;
}

/** The clock times show in: the visitor's when known and on, else the church's. */
export function siteTimezone(): string {
  if (!visitorTimeOn) return churchTimezone();
  return visitorTimezone() || churchTimezone();
}

/** A short, human name for a zone: "America/New_York" → "New York". */
export function zoneLabel(tz = siteTimezone()): string {
  const tail = zoneOr(tz).split("/").pop() || tz;
  return tail.replace(/_/g, " ");
}

/** A usable zone: the one asked for, or `fallback` — never a zone that throws. */
export function zoneOr(tz: unknown, fallback = siteTimezone()): string {
  return isValidTimezone(tz) ? (tz as string).trim() : fallback;
}

function zoneFormatter(tz: string) {
  let formatter = ZONE_CACHE.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    ZONE_CACHE.set(tz, formatter);
  }
  return formatter;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday. */
  weekday: number;
};

/** What the clock on the wall reads in `tz` at this instant. */
export function zonedParts(date: Date = new Date(), tz = siteTimezone()): ZonedParts {
  const parts = zoneFormatter(zoneOr(tz)).formatToParts(date);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const year = num("year");
  const month = num("month");
  const day = num("day");
  return {
    year,
    month,
    day,
    hour: num("hour") % 24,
    minute: num("minute"),
    second: num("second"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** How far ahead of UTC `tz` is at this instant, in milliseconds. */
function zoneOffsetMs(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** The instant a wall time reads in `tz` (day overflow fine; DST-safe). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0, tz = churchTimezone()): Date {
  const zone = zoneOr(tz);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ts = guess - zoneOffsetMs(new Date(guess), zone);
  ts = guess - zoneOffsetMs(new Date(ts), zone);
  return new Date(ts);
}

/** The year it is on the church's clock. */
export function zoneYear(date: Date = new Date(), tz = siteTimezone()): number {
  return zonedParts(date, tz).year;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function pad(n: number) {
  return n < 10 ? "0" + n : String(n);
}

export function to12h(time: string) {
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mRaw} ${suffix}`;
}

/** A weekday + 24-hour "HH:MM" pair — a time as some clock reads it. */
export type WallClock = { day: number; time: string };

/** What the site's own clock reads at an instant (a gathering, an activity). */
export function clockAt(input: string | Date | number, tz = siteTimezone()): WallClock {
  const d = input instanceof Date ? input : new Date(input);
  const p = zonedParts(d, tz);
  return { day: p.weekday, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** A weekly day + "HH:MM" written in `from`, read on the visitor's clock. */
export function clockHere(time: string, day: number, from = churchTimezone()): WallClock {
  const source = zoneOr(from);
  const to = siteTimezone();
  if (to === source) return { day, time };
  const at = nextOccurrence({ day, time, name: "", minutes: 0 }, new Date(), source);
  return clockAt(at, to);
}

export function todayKey(d = new Date(), tz = siteTimezone()) {
  const p = zonedParts(d, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export type DateStyle = "long" | "medium" | "short" | "weekday" | "month";

/** A calendar date as the church sees it (Lagos time unless told otherwise). */
export function fmtDate(input: string | Date | number, style: DateStyle = "medium", tz = siteTimezone()) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : style === "short"
      ? { month: "short", day: "numeric" }
      : style === "weekday"
      ? { weekday: "long", month: "long", day: "numeric" }
      : style === "month"
      ? { month: "long", year: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString(undefined, { ...opts, timeZone: zoneOr(tz) });
}

/** A clock time as the church sees it — used where an instant is shown. */
export function fmtTime(
  input: string | Date | number,
  options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" },
  tz = siteTimezone()
) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { ...options, timeZone: zoneOr(tz) });
}

export function relativeTime(input: string | Date | number) {
  const d = input instanceof Date ? input : new Date(input);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (mins < 60) return rtf.format(Math.round(diff / 60000), "minute");
  const hours = Math.round(abs / 3600000);
  if (hours < 24) return rtf.format(Math.round(diff / 3600000), "hour");
  const days = Math.round(abs / 86400000);
  if (days < 31) return rtf.format(Math.round(diff / 86400000), "day");
  const months = Math.round(days / 30);
  if (months < 12) return rtf.format(Math.round(diff / 2592000000), "month");
  return fmtDate(d, "medium");
}

export function parseDuration(text: string): number {
  const parts = text.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1];
  if (parts.length === 2) return parts[0];
  return 0;
}

export function fmtDuration(minutes: number) {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} hr ${m} min` : `${h} hr`;
  }
  return `${minutes} min`;
}

/* ---------------- service times ---------------- */

export type ServiceSlot = { day: number; time: string; name: string; minutes: number };

/** When a gathering next happens; pass the branch's zone (note 84). */
export function nextOccurrence(slot: ServiceSlot, now = new Date(), tz = churchTimezone()): Date {
  const zone = zoneOr(tz);
  const [h, m] = slot.time.split(":").map(Number);
  const p = zonedParts(now, zone);
  const ahead = (slot.day - p.weekday + 7) % 7;
  let at = zonedTimeToUtc(p.year, p.month, p.day + ahead, h, m, zone);
  if (at.getTime() <= now.getTime()) at = zonedTimeToUtc(p.year, p.month, p.day + ahead + 7, h, m, zone);
  return at;
}

export type NextServiceInfo = {
  slot: ServiceSlot;
  at: Date;
  msUntil: number;
  isLive: boolean;
  endsAt: Date;
};

/** The gathering in progress, else the next one with its wait. Skips hand-ended ones (note 106). */
export function nextService(schedule: ServiceSlot[], now = new Date(), tz = churchTimezone()): NextServiceInfo | null {
  if (!schedule?.length) return null;
  const zone = zoneOr(tz);
  const p = zonedParts(now, zone);
  const enriched = schedule.map((slot) => {
    const at = nextOccurrence(slot, now, zone);
    return { slot, at, msUntil: at.getTime() - now.getTime() };
  });
  enriched.sort((a, b) => a.msUntil - b.msUntil);

  for (const slot of schedule) {
    const [h, m] = slot.time.split(":").map(Number);
    for (let back = 0; back <= 7; back++) {
      const start = zonedTimeToUtc(p.year, p.month, p.day - back, h, m, zone);
      if (zonedParts(start, zone).weekday !== slot.day) continue;
      const end = new Date(start.getTime() + (slot.minutes || 120) * 60000);
      if (now >= start && now <= end) {
        /* Ended by hand — or by the stream itself? Then it is not this
           gathering's turn any more (SPEC notes 106, 133). */
        if (Math.max(Number(LIVE.liveCut) || 0, streamCut()) >= start.getTime()) break;
        return { slot, at: start, endsAt: end, msUntil: 0, isLive: true };
      }
    }
  }
  const first = enriched[0];
  if (!first) return null;
  return { slot: first.slot, at: first.at, endsAt: new Date(first.at.getTime() + (first.slot.minutes || 120) * 60000), msUntil: first.msUntil, isLive: false };
}

/** The stream's own cut: a gathering begun before a watched broadcast ended is over (notes 106, 133). */
export function streamCut(): number {
  const endedAt = liveEndedAt();
  if (!endedAt) return 0;
  if (Number(LIVE.liveCommandAt) > endedAt) return 0;
  if (Number(LIVE.liveSince) > endedAt) return 0;
  return endedAt;
}

/** On air now? The stream, the office switch, or the service clock says so (notes 106, 133). */
export function onAir(info?: NextServiceInfo | null): boolean {
  if (liveNow()) return true;
  if (!LIVE.isLive && !info?.isLive) return false;
  const cut = streamCut();
  if (cut && cut >= (info?.isLive ? info.at.getTime() : 0)) return false;
  return true;
}

export function countdownParts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/* ---------------- geo ---------------- */

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fmtDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 1000) return `${km.toFixed(km < 10 ? 1 : 0)} km away`;
  return `${Math.round(km).toLocaleString()} km away`;
}

export function directionsUrl(opts: { lat: number; lng: number; address?: string }) {
  const dest = `${opts.lat},${opts.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

export function mapEmbedUrl(opts: { lat: number; lng: number; zoom?: number }) {
  const { lat, lng, zoom = 14 } = opts;
  const d = 0.02;
  const bbox = `${lng - d},${lat - d / 1.6},${lng + d},${lat + d / 1.6}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

/* ---------------- text / files ---------------- */

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function downloadText(filename: string, text: string, mime = "text/plain") {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    fireToast(ct("site.toastDownloaded", { name: filename }), "success");
  } catch {
    fireToast(ct("site.toastDownloadBlocked"), "error");
  }
}

export function toIcs(opts: { title: string; description?: string; location?: string; start: Date; minutes: number; remindMinutes?: number }) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const end = new Date(opts.start.getTime() + opts.minutes * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//World Overcomers Ministries//EN",
    "BEGIN:VEVENT",
    `UID:${uid("evt")}@worldovercomers`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(opts.start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${opts.title}`,
    `DESCRIPTION:${(opts.description || "").replace(/\n/g, "\\n")}`,
    `LOCATION:${(opts.location || "").replace(/\n/g, "\\n")}`,
    /* The alarm is what makes it a *reminder* rather than a bare entry: the
       device's calendar notifies this many minutes before it starts. */
    "BEGIN:VALARM",
    `TRIGGER:-PT${Math.max(0, opts.remindMinutes ?? 30)}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${opts.title}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

/* ---------------- handing an event to the visitor's own calendar ---------------- */

/** The two shapes a web page can offer a device's calendar: the .ics file, and
    Google Calendar's own pre-filled "add event" page. Both carry the event's
    title, so whatever the visitor is handed is already named. */
export function calendarInvite(opts: { title: string; description?: string; location?: string; start: Date; minutes: number }) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const end = new Date(opts.start.getTime() + (opts.minutes || 60) * 60000);
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${stamp(opts.start)}/${stamp(end)}`,
  });
  if (opts.description) query.set("details", opts.description);
  if (opts.location) query.set("location", opts.location);
  return {
    ics: toIcs(opts),
    filename: `${slugify(opts.title).slice(0, 48).replace(/-+$/, "") || "event"}.ics`,
    googleUrl: `https://calendar.google.com/calendar/render?${query.toString()}`,
  };
}

/** True where the phone's own calendar is Apple's — there the .ics *is* the
    hand-off, because no web page can write into Apple Calendar directly. */
function appleCalendar() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && !/Chrome|Chromium|CriOS|Edg\//.test(ua);
}

/** Hand an event to the visitor's calendar (Google page, Apple .ics, else download). */
export function addToCalendar(opts: { title: string; description?: string; location?: string; start: Date; minutes: number }, filename?: string) {
  const invite = calendarInvite(opts);
  const name = filename || invite.filename;
  let url = invite.googleUrl;
  if (appleCalendar()) {
    url = URL.createObjectURL(new Blob([invite.ics], { type: "text/calendar;charset=utf-8" }));
    window.setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  try {
    if (window.open(url, "_blank", "noopener")) return true;
  } catch {
    /* a blocked popup falls through to the download */
  }
  downloadText(name, invite.ics, "text/calendar");
  return false;
}

export async function copyText(text: string, label = ct("site.toastCopied")) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    fireToast(label, "success");
    return true;
  } catch {
    fireToast(ct("site.toastClipboardFailed"), "error");
    return false;
  }
}

export async function shareContent(opts: { title: string; text?: string; url: string }) {
  try {
    if (navigator.share) {
      await navigator.share(opts);
      return true;
    }
  } catch {
    return false;
  }
  return copyText(`${opts.title} — ${opts.url}`, ct("site.toastLinkCopied"));
}

export function mailto(to: string, subject: string, body: string) {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function whatsappLink(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Shrink a photo for upload, re-encoded as JPEG (original if undecodable). */
export async function compressImageBlob(file: File, maxWidth = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob || file;
  } catch {
    return file;
  }
}

export async function compressImage(file: File, maxWidth = 900, quality = 0.78): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode-failed"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxWidth / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

/* ---------------- deterministic daily picks ---------------- */

export function hashString(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function pickForDay<T>(items: T[], salt = "", date = new Date()): T {
  const seed = hashString(todayKey(date) + salt);
  return items[seed % items.length];
}

/* ---------------- records ---------------- */

export type PrayerRequest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  urgency: "normal" | "urgent";
  text: string;
  anonymous: boolean;
  followUp: boolean;
  createdAt: number;
  answered: boolean;
  prayed: number;
  iPrayed: boolean;
};

export type WallPrayer = {
  id: string;
  name: string;
  category: string;
  text: string;
  createdAt: number;
  prayed: number;
  mine?: boolean;
};

export type Testimony = {
  id: string;
  name: string;
  city: string;
  category: string;
  title: string;
  body: string;
  createdAt: number;
  amens: number;
  iAmened: boolean;
  photo?: string;
  monogram?: string;
  mine?: boolean;
};

export type GivingRecord = {
  id: string;
  amount: number;
  fund: string;
  frequency: "one-time" | "monthly";
  method: string;
  ref: string;
  createdAt: number;
};

export type VisitPlan = {
  branchId: string;
  serviceIndex: number;
  adults: number;
  kids: number;
  accessibility: string;
  name: string;
  email: string;
  questions: string;
  createdAt: number;
};

export type ReadingDay = { day: number; done: boolean; verse: string };

/** Church money in, visitor money out: every amount shows in the reader's currency. */

/** The currency the site's own figures are written in, unless the profile says otherwise. */
export const DEFAULT_CURRENCY = "USD";

const CURRENCY_VALID = new Map<string, boolean>();

/** Is this a currency the browser actually knows (e.g. "NGN")? */
export function isValidCurrency(code: unknown): code is string {
  if (typeof code !== "string" || !code.trim()) return false;
  const key = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(key)) return false;
  let ok = CURRENCY_VALID.get(key);
  if (ok === undefined) {
    try {
      new Intl.NumberFormat("en", { style: "currency", currency: key });
      ok = true;
    } catch {
      ok = false;
    }
    CURRENCY_VALID.set(key, ok);
  }
  return ok;
}

/** The currency a country uses, from the generated table. "" when unknown. */
export function currencyOfCountry(country: unknown): string {
  if (typeof country !== "string") return "";
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] || "";
}

let configuredCurrency = "";

/** The church profile's currency. */
export function setBaseCurrency(code: unknown) {
  if (isValidCurrency(code)) configuredCurrency = code.trim().toUpperCase();
}

/** The currency the church's own figures are written in. */
export function baseCurrency(): string {
  if (configuredCurrency) return configuredCurrency;
  const global = (globalThis as any).churchCurrency;
  const raw = typeof global === "string" ? global : global && typeof global.evaluateItem === "string" ? global.evaluateItem : "";
  return isValidCurrency(raw) ? raw.toUpperCase() : DEFAULT_CURRENCY;
}

/* Rates are "1 USD buys this much", uppercase codes with their fetch day. */

export type FxRates = {
  base: string;
  rates: Record<string, number>;
  at: number;
  source: "live" | "snapshot";
};

export const RATES_KEY = KEYS.rates;

export function normalizeRates(raw: any): FxRates | null {
  if (!raw || typeof raw !== "object" || !raw.rates || typeof raw.rates !== "object") return null;
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(raw.rates)) {
    const key = String(code).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(key)) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) rates[key] = n;
  }
  if (Object.keys(rates).length < 20 || !rates.USD) return null;
  return { base: "USD", rates, at: Number(raw.at) || 0, source: raw.source === "live" ? "live" : "snapshot" };
}

function readStoredRates(): FxRates | null {
  try {
    const raw = localStorage.getItem(RATES_KEY);
    return raw ? normalizeRates(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** The dated snapshot that travels with the site (src/data/currencies.ts). */
export function snapshotRates(): FxRates {
  return { base: "USD", rates: FALLBACK_RATES, at: 0, source: "snapshot" };
}

let fxRates: FxRates | null = readStoredRates();

/** Record (or clear) the fetched rates. Also what the React hook watches. */
export function setRates(raw: unknown) {
  fxRates = normalizeRates(raw);
}

/** The rates in hand: the fetched ones, else the snapshot that ships with the site. */
export function getRates(): FxRates {
  return fxRates || snapshotRates();
}

/** 1 US dollar buys how much of `code`? `null` when neither table knows it. */
function usdRate(code: string): number | null {
  const key = code.toUpperCase();
  const fetched = fxRates ? fxRates.rates[key] : undefined;
  if (typeof fetched === "number" && fetched > 0) return fetched;
  const snap = (FALLBACK_RATES as Record<string, number>)[key];
  return typeof snap === "number" && snap > 0 ? snap : null;
}

/** `amount` of `from`, converted into `to`. `null` when we have no rate for one of them. */
export function convertMoney(amount: number, from: string, to: string): number | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return amount;
  const rf = usdRate(f);
  const rt = usdRate(t);
  if (rf === null || rt === null) return null;
  return (amount / rf) * rt;
}

/** The currency amounts show in: the visitor's when known, on and convertible. */
export function displayCurrency(): string {
  const base = baseCurrency();
  if (!visitorMoneyOn) return base;
  const own = visitorCurrency();
  if (!own || own === base) return base;
  return convertMoney(1, base, own) === null ? base : own;
}

/** True when the visitor is reading money in a currency of their own. */
export function showingOwnCurrency(): boolean {
  return displayCurrency() !== baseCurrency();
}

/** Three significant figures, so a converted amount stays a tidy number. */
function roundNice(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.abs(value))) - 2));
  return Math.round(value / magnitude) * magnitude;
}

/** An amount written in the church's currency, shown in the reader's. */
export function fmtMoney(amount: number, currency = baseCurrency()) {
  const from = isValidCurrency(currency) ? currency.toUpperCase() : baseCurrency();
  const to = displayCurrency();
  let value = amount;
  if (to !== from) {
    const converted = convertMoney(amount, from, to);
    if (converted !== null) value = roundNice(converted);
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: to,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${value} ${to}`;
  }
}

/** Dollar figures in the office's prose, said in the visitor's money (note 103). */
export function moneyText(text: string): string {
  if (!text || !showingOwnCurrency()) return text;
  return text.replace(/\$\s?(\d[\d,]*(?:\.\d+)?)/g, (match, digits: string) => {
    const n = Number(digits.replace(/,/g, ""));
    return Number.isFinite(n) ? fmtMoney(n) : match;
  });
}

/** Counts of one read right ("1 day", not "1 days"; note 103). */
export function tidyCount(text: string): string {
  return text.replace(/\b1 (days|hours|minutes|seconds|weeks|months|years)\b/g, (_match, unit: string) => `1 ${unit.slice(0, -1)}`);
}
