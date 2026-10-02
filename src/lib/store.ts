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

/* --------------------------------------------------------------- the clock

   There are **two clocks**, and the difference between them is the whole point
   of this section (SPEC notes 84 and 85).

   1. **The church's own clock** — `churchTimezone()`. The church is
      headquartered in Lagos, Nigeria, so this is `Africa/Lagos` unless the
      church profile says otherwise. It is the clock everything the church
      *writes down* is written in: the Sunday gathering is "09:00", the office
      opens at "09:00", the daily verse belongs to the church's own date — and
      it is the fallback whenever the visitor's own clock cannot be worked out.

   2. **The visitor's own clock** — `visitorTimezone()`. Found from the
      visitor's **IP address** when the site loads (src/lib/visitor.ts talks to
      a geolocation service directly from the browser, so the service sees the
      visitor's address and not perchance's proxy). Where we know it, every
      time the visitor *reads* is shown in their own time: the header pill and
      the countdowns say when a gathering happens for them, the schedule tables
      read in their time, the office's open/closed line is still the office's
      own (the office is in Lagos — that is a fact about Lagos, not about the
      reader), but the clock times beside it are theirs.

   `siteTimezone()` is the clock the site *shows in*: the visitor's own when we
   know it, the church's otherwise. Everything that formats a time for a
   visitor defaults to it, which is why most of the site needed no change at
   all when the visitor clock arrived. The office can turn it off for everybody
   (*Church profile → Show each visitor their own time zone*), which is what
   puts everyone back on the church's clock.

   Branch service times are the one thing that is written in a zone of its own:
   a branch's schedule belongs to *that branch's* time zone (the `timezone` on
   the branch in the console — America/Chicago for Dallas, Africa/Lagos for the
   Nigerian branches), because 9:00 AM in Dallas is 3:00 PM in Lagos. That is
   the zone the *instant* is computed in — `branchZone(branch)` — and the
   instant is then shown on the reader's own clock (`clockHere`). A branch with
   no time zone of its own follows the church's.

   Time zones come from the platform's own `Intl` data — nothing here is
   hard-coded to an offset, so daylight saving in Chicago or Toronto is handled
   for us (see SPEC note 84). */

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

/**
 * The zone the church profile names (the console's *Church profile → Time
 * zone*). Called once at start-up and again whenever that profile changes.
 */
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

/* ------------------------------------------------- the visitor's own clock

   Where the visitor is, worked out from their IP address the moment the site
   loads (see src/lib/visitor.ts — the lookup is a *direct* fetch from the
   browser, so the geolocation service sees the visitor's own address). It is
   kept in localStorage so a returning visitor paints in their own time on the
   very first frame, and it is remembered with the place name so the site can
   say which clock it is using. */

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

/**
 * The shape of answer the lookup gives. Bumped when it starts carrying
 * something new, so a clock cached by an older version of the site is looked up
 * again rather than used as it is — the country and currency joined the time
 * zone afterwards (SPEC note 98).
 */
export const VISITOR_CLOCK_V = 2;

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

/**
 * Is the site allowed to show each visitor money in their own currency? The
 * office can turn this off (*Church profile → Show each visitor their own
 * currency*), which puts every reader back on the church's currency.
 */
let visitorMoneyOn = true;
export function setVisitorCurrencyEnabled(on: unknown) {
  visitorMoneyOn = on !== false;
}
export function visitorCurrencyEnabled(): boolean {
  return visitorMoneyOn;
}

/**
 * Is the site allowed to show each visitor their own time? The office can turn
 * this off (*Church profile → Show each visitor their own time zone*), which
 * puts every reader back on the church's clock.
 */
let visitorTimeOn = true;
export function setVisitorTimeEnabled(on: unknown) {
  visitorTimeOn = on !== false;
}
export function visitorTimeEnabled(): boolean {
  return visitorTimeOn;
}

/**
 * The clock the site shows times in: the visitor's own when we know it and the
 * office has left it on, otherwise the church's.
 */
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

/**
 * The instant at which the clock in `tz` reads this wall time. Month/day
 * overflow is fine (day 34 becomes the right date next month). Two passes so
 * a change of offset (daylight saving) lands on the right side of the change.
 */
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

/**
 * A **weekly** wall time — a schedule entry's day and "HH:MM" — read on the
 * visitor's own clock. `from` is the zone the time is *written* in (a branch's
 * own, or the church's): the gathering happens at that instant, and this is
 * what the reader's clock says at that moment. So the Dallas branch's Sunday
 * 09:00 reads "Sunday 3:00 PM" to a member sitting in Lagos.
 */
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

/**
 * When this gathering next happens — the wall-clock day and time read in `tz`.
 * Pass the *branch's* zone: a Lagos 07:00 service is 07:00 Lagos whether the
 * visitor is in Oke-Odo or Oklahoma (SPEC note 84).
 */
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

/**
 * The gathering the site should be talking about: the one the clock is inside
 * right now, or — if none is — the next one, with how long until it starts.
 *
 * One gathering is deliberately stepped over: one the office has **ended by
 * hand**. Pressing *Stop the livestream* while the clock is inside a service
 * means that service is over, even though its scheduled hours have not run out
 * yet. Reporting it as "on" would say live when the office said otherwise, and
 * reporting it as "next" would print a countdown of `0h 0m` for the rest of its
 * hours — so the clock steps past it and answers with the gathering after it
 * (`LIVE.liveCut` is the moment of the stop; only a gathering that began before
 * that moment is over — see SPEC note 106).
 */
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

/**
 * The cut the *stream* puts on the clock, in the same shape as `LIVE.liveCut`
 * (the office's): a gathering that began before this moment is over.
 *
 * It is the moment a broadcast this browser was watching ended — `endedAt` in
 * `src/lib/livestatus.ts`, which is set the moment a "live" answer is followed
 * by "off" and left alone until a broadcast comes back. That is what lets the
 * whole site stop showing *Live now* the instant the stream ends, without
 * anybody editing content: `onAir()` honours it, and `nextService` steps over
 * the gathering it interrupted, so the page counts down to the *next* service
 * instead of printing `0h 0m` for the rest of its hours (SPEC notes 106, 133).
 *
 * The office's word beats it, exactly as it does in the drawer's own watcher: a
 * *Start* / *Continue* newer than the ending is a person saying they are
 * streaming again, and an ending from an older session (last Sunday's) is
 * behind the gathering the clock is on now, so neither can silence the site.
 */
export function streamCut(): number {
  const endedAt = liveEndedAt();
  if (!endedAt) return 0;
  if (Number(LIVE.liveCommandAt) > endedAt) return 0;
  if (Number(LIVE.liveSince) > endedAt) return 0;
  return endedAt;
}

/**
 * Is the church on air *right now*? Three things can say so, and any one is
 * enough:
 *
 * - the **stream itself** — the live check found the church's channel
 *   broadcasting (`liveNow()` in src/lib/livestatus.ts). This is the one that
 *   works off the schedule: a special broadcast, or a service that moved, puts
 *   the whole site on air with nobody touching the site (SPEC note 133).
 * - the office's own **We are on air right now** switch (the drawer's *Live
 *   stream* section — `LIVE.isLive`, written by the *Start* / *Continue* /
 *   *Stop* buttons above it), and
 * - the **service clock**: a scheduled slot that is inside its own hours.
 *
 * The switch wins over the clock, because it is a person saying "we are
 * broadcasting": a gathering that moved at the last minute, or a special
 * broadcast, must be able to put the site on air without anyone editing the
 * schedule first.
 *
 * A *stop* is a person speaking too, and there are two of them, both read here:
 * a gathering the office ended by hand is stepped over by `nextService` (so
 * `info.isLive` is false for it), and a broadcast that ended on the channel is
 * `streamCut()` — the site cannot flick back to "live" a minute after the
 * stream went off air, and a *Continue* after that ending brings it back
 * (SPEC notes 106, 133).
 *
 * Everything that shows a live state reads this one function — the header's
 * service pill, the home page's hero line and next-gathering card, the Watch
 * live panel — so the site can never say "live" in one place and "starts in 5
 * hours" in another (SPEC note 83).
 */
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

/**
 * Hand an event to the visitor's own calendar, already named. Where the device
 * has a Google Calendar (Android, and iOS with the app installed) the pre-filled
 * Google Calendar page opens — the phone's calendar app takes it from there —
 * and on an Apple device the .ics goes to Safari, which hands it to Calendar.
 * If the browser blocks that (an in-app browser, say) the .ics is downloaded
 * instead, exactly as it used to be.
 */
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

/**
 * Prepare a photo for upload: resize it to a sensible width and re-encode it
 * as JPEG. Falls back to the original file if the browser cannot decode it.
 */
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

/* ---------------- money ----------------

   The money the church writes down — the giving amounts, an event's cost, the
   allocation card — is written in **one** currency: `baseCurrency()`, from the
   church profile (US dollars unless the office says otherwise). Every visitor
   then *reads* it in their own: the currency of the country their IP address is
   registered in, which is the same answer that gives them their clock
   (src/lib/visitor.ts; `COUNTRY_CURRENCY` in src/data/currencies.ts).

   So a $25 offering is read as naira in Lagos and as the dollars it was written
   as in Texas — converting an amount into the currency it is already in is a
   no-op, which is why the figures the office typed are exactly what a reader of
   the church's own currency sees. Where we cannot name the visitor's currency,
   or cannot convert into it, the site simply stays in the church's currency.

   The rate comes from a free, keyless, CORS-open feed the visitor's own browser
   fetches (src/lib/rates.ts) and is kept for half a day; if the feed cannot be
   reached, a dated snapshot that travels with the site is used instead, so the
   figures are still the right *shape*, only older. Converted amounts are rounded
   to three significant figures before they are shown, so a rate never turns a
   tidy $25 into "₦38,281.34".

   The office can turn the whole thing off (*Church profile → Show each visitor
   their own currency*), which puts every reader back on the church's currency.
   See SPEC note 98. */

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

/**
 * The currency the church profile names (*Church profile → Currency*). Called
 * once at start-up and again whenever that profile changes.
 */
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

/* ------------------------------------------------------------- the rates

   "1 US dollar buys this much." The feed's own shape, normalized: uppercase
   three-letter codes, a number each, and the day it was fetched. */

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

/**
 * The currency the visitor should *read* amounts in: their own country's, when
 * we know it, the office has left the switch on and we can actually convert
 * into it — otherwise the church's own.
 */
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

/**
 * An amount of money, written for a visitor: `amount` is in `currency` (the
 * church's own by default) and is shown in `displayCurrency()`.
 */
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

/**
 * The dollar figures inside the church's own prose — an event's cost, "Where
 * every $100 goes" — said in the visitor's money. A "$" in the office's copy
 * always means the church's own currency, so a reader of that currency sees the
 * sentence exactly as the office typed it.
 */
export function moneyText(text: string): string {
  if (!text || !showingOwnCurrency()) return text;
  return text.replace(/\$\s?(\d[\d,]*(?:\.\d+)?)/g, (match, digits: string) => {
    const n = Number(digits.replace(/,/g, ""));
    return Number.isFinite(n) ? fmtMoney(n) : match;
  });
}

/**
 * The other thing the office's own prose can get wrong: a count of one. The
 * pages build their countdown and duration lines out of a number and a unit the
 * office can reword ("{{days}} days", "hours", "{{v0}} days"), so a line that
 * lands on one would read "1 days" — the phrase is put right as it is drawn,
 * the way moneyText() does for a "$" (SPEC note 103).
 */
export function tidyCount(text: string): string {
  return text.replace(/\b1 (days|hours|minutes|seconds|weeks|months|years)\b/g, (_match, unit: string) => `1 ${unit.slice(0, -1)}`);
}
