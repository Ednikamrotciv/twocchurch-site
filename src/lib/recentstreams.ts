/* ============================================================================
   The services we have streamed lately.

   "Recent services" on the Watch live page is the site's short memory of the
   broadcast: the services streamed most recently, playing right here — six of
   them, or as many as the office asks for (Live stream → *How many recent
   services to show*, read through `recentLimit()` in src/data/live.ts). Nobody
   types the list in, and it is not a copy of the sermon archive — it is read
   from the church's own YouTube channel, so the moment a service comes off air
   it takes its place at the top and the oldest one drops off the end. Older
   livestreams stay where they always were: on YouTube and Facebook, which is
   what the section's line tells the visitor.

   How the list is read (and why not with a plain fetch):

   - YouTube sends no CORS headers, so the request goes through perchance's own
     proxy, `superFetch` — the same door `src/lib/livestatus.ts` uses to ask
     whether we are on air. No key, no account, nothing to renew.
   - The channel's **RSS feed** (`/feeds/videos.xml?channel_id=…`) is the list
     itself: every kind of upload, newest first, with an exact `<published>`
     date and the video's own title. That matters more than it looks —
     **YouTube's /videos tab does not carry a channel's live archives**, and a
     church's Sunday services are exactly that, so a list built from /videos
     alone misses the very services this section exists to show (the church's
     own channel read: /videos began at a 3-week-old clip and then jumped
     eleven months, while its Sundays sat on the /streams tab unread).
   - The **channel's /videos tab** is read at the same time for the two things
     the feed does not carry: YouTube's own "3 weeks ago" line (the feed's dates
     are exact, but the grid's words are what is left when a service is older
     than the feed's fifteen), and the videos beyond the feed's window. Where
     the two disagree, the feed wins — thirty entries of depth behind a list
     the office asks six of.
   - **One message, however many times it was published.** A broken stream
     leaves YouTube with two or three videos of the same service — the same
     headline, minutes or hours apart — and a band of six would then show the
     same Sunday twice. Uploads whose headlines match *and* whose dates are
     nearest each other are one message, and the card is the service's own start
     (the first of them) so the player opens it from the beginning (SPEC note
     113).
   - The office may paste a `@handle`, a channel id or any channel link, so the
     handle is resolved to the channel id once, through the channel page, and
     remembered — a channel id never changes.

   Everything degrades quietly. A failed read leaves the last good list in
   place, and a site whose channel has not been set yet simply has no list — the
   page falls back to the newest messages it already holds.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { LIVE } from "../data/live";
import { parseYoutubeId } from "./embed";
import { liveTarget } from "./livestatus";
import { readStore, writeStore } from "./hooks";

export type RecentService = {
  /** The YouTube video the service was published as. */
  videoId: string;
  /** The video's own headline, as it is on YouTube (channel name trimmed). */
  title: string;
  /** When YouTube published it (ms) — from the feed. 0 when the feed missed it. */
  at: number;
  /** YouTube's own words when we have no date: "3 weeks ago". */
  ago: string;
  /** The still shown before the visitor presses play. */
  thumb: string;
  /**
   * Set when the card was put in the list from a broadcast that had just ended
   * (ms) rather than read off the channel — so the service is in *Recent
   * services* the second the stream closes, before YouTube has published the
   * recording. Dropped as soon as a read lists the video itself, and after
   * `SEED_MAX_MS` either way.
   */
  seeded?: number;
};

export type RecentServices = {
  items: RecentService[];
  /** When the list was read (ms). 0 when it never has been. */
  at: number;
  /** The channel the list came from, once it is known. */
  channelId: string;
};

export const RECENT_KEY = "wom.recentstreams";
/** The channel id behind whatever the office pasted (it never changes). */
const CHANNEL_KEY = "wom.ytchannel";

/** How many of the channel's own list is carried, before the office's number picks from it. */
const KEEP = 24;
/** Two uploads this close together — with the same headline — are one message. */
const SAME_MESSAGE_MS = 20 * 60 * 60 * 1000;
/** The channel is re-read this often in the quiet week… */
const IDLE_MS = 10 * 60_000;
/** …and this often while a service is on the clock or on air. */
const SOON_MS = 90_000;
/** …and how long the short cadence is kept after a service comes off air. */
const BURST_MS = 6 * 60_000;
/** How long a just-ended service waits for YouTube to publish it. */
const SEED_MAX_MS = 12 * 60 * 60 * 1000;
/** Give the proxy this long before calling a read a failure. */
const TIMEOUT_MS = 20_000;

const EMPTY: RecentServices = { items: [], at: 0, channelId: "" };

/* ------------------------------------------------------------------- target */

/** A channel id as the office might have pasted it, if it is in there. */
function channelIdIn(value: string): string {
  return /(UC[\w-]{20,24})/.exec(String(value || ""))?.[1] || "";
}

/**
 * The channel's *page*, from the /live address the live check watches — the
 * parsing of what the office pasted lives in one place (`liveTarget`).
 */
function channelPageUrl(): string {
  const target = liveTarget();
  if (!target || target.kind !== "channel") return "";
  return target.url.replace(/\/live\/*$/i, "");
}

/** The channel id behind the office's channel setting, resolving a handle once. */
async function resolveChannelId(): Promise<string> {
  const pasted = String(LIVE.youtubeChannel || "").trim();
  if (!pasted) return "";
  const direct = channelIdIn(pasted);
  if (direct) return direct;

  const cached = readStore<{ value?: string; id?: string } | null>(CHANNEL_KEY, null);
  if (cached && cached.value === pasted && cached.id) return String(cached.id);

  const page = channelPageUrl();
  if (!page) return "";
  const html = await fetchText(page);
  if (!html) return "";
  const id =
    /"externalId":"(UC[\w-]{20,24})"/.exec(html)?.[1] ||
    /"channelId":"(UC[\w-]{20,24})"/.exec(html)?.[1] ||
    /youtube\.com\/channel\/(UC[\w-]{20,24})/.exec(html)?.[1] ||
    "";
  if (id) writeStore(CHANNEL_KEY, { value: pasted, id });
  return id;
}

/* ---------------------------------------------------------------- the fetch */

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("recent services timed out")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(id);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(id);
        reject(err);
      }
    );
  });
}

/** A page of YouTube: the local dev server proxies it (same fix as livestatus),
    else through perchance's proxy, else through a public CORS proxy so the
    static deployments (which have neither) still read the channel. Null when
    unreachable. */
async function fetchText(url: string): Promise<string | null> {
  const local = await fetchTextLocal(url);
  if (local) return local;
  const proxy = (window as any).root?.superFetch;
  if (typeof proxy === "function") {
    try {
      const res = await withTimeout(proxy(url) as Promise<Response>, TIMEOUT_MS);
      if (res && res.ok !== false) {
        const text = await res.text();
        if (typeof text === "string" && text.length > 0) return text;
      }
    } catch (err) {
      /* fall through to the public proxy */
    }
  }
  return fetchTextRemote(url);
}

/* Last resort for hosts with no same-origin proxy: a free public CORS proxy.
   Only reached when both local and perchance doors are absent, and a miss
   degrades exactly as before (the last good list stands). */
async function fetchTextRemote(url: string): Promise<string | null> {
  try {
    const res = await withTimeout(
      fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { cache: "no-store" }),
      TIMEOUT_MS
    );
    if (!res || !res.ok) return null;
    const text = await res.text();
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/** Same-origin YouTube read for local runs (`scripts/serve.mjs` /__yt). Only
    attempted on a local host, so the live site never pays for the detour. */
async function fetchTextLocal(url: string): Promise<string | null> {
  try {
    const host = window.location?.hostname || "";
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "") return null;
    const res = await withTimeout(fetch(`/__yt?url=${encodeURIComponent(url)}`, { cache: "no-store" }), TIMEOUT_MS);
    if (!res || !res.ok) return null;
    const text = await res.text();
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function decodeXml(value: string): string {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** YouTube writes titles as JSON strings inside the grid: undo the escapes. */
function decodeJson(value: string): string {
  return String(value || "").replace(/\\"/g, '"').replace(/\\u([\da-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Trim the channel's own name off the end of a headline ("… | Elevation Church"). */
function trimChannel(title: string, channel: string): string {
  const name = String(channel || "").trim();
  if (!name) return title;
  const cut = title.replace(new RegExp("\\s*[|\\u2013\\u2014-]\\s*" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "i"), "");
  return cut.trim() || title;
}

/**
 * "2w ago" → "2 weeks ago". YouTube writes the short form in one page variant
 * and the long one in another, and a card reads better in words.
 */
export function prettyAgo(text: string): string {
  /* The /streams tab says "Streamed 4 days ago" where /videos says "4 days
     ago"; one card reads the same as the next (SPEC note 113). */
  const value = String(text || "")
    .trim()
    .replace(/^(?:streamed|premiered|started streaming)\s+/i, "");
  const m = /^(\d+)\s*(min|h|hr|d|w|mo|m|y)\s*ago$/i.exec(value);
  if (!m) return value;
  const n = Number(m[1]);
  const units: Record<string, string> = { min: "minute", h: "hour", hr: "hour", d: "day", w: "week", mo: "month", m: "minute", y: "year" };
  const unit = units[m[2].toLowerCase()];
  if (!unit) return value;
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/**
 * The channel's /videos list: newest first, no Shorts, with YouTube's own
 * "how long ago" line for each one.
 */
export function parseVideosPage(html: string): { videoId: string; title: string; ago: string }[] {
  const out: { videoId: string; title: string; ago: string }[] = [];
  const text = String(html || "");
  const parts = text.split('"lockupMetadataViewModel":{');
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i].slice(0, 12_000);
    const title = decodeJson(/"title":\{"content":"((?:[^"\\]|\\.)*)"/.exec(chunk)?.[1] || "").trim();
    const videoId = /"contentId":"([\w-]{11})","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"/.exec(chunk)?.[1] || "";
    if (!videoId || !title) continue;
    /* The "3 weeks ago" line sits in the metadata row after the title. */
    const agoRaw =
      /"accessibilityLabel":"([^"]*\bago)"/.exec(chunk)?.[1] ||
      /"text":\{"content":"([^"]*\bago)"\}/.exec(chunk)?.[1] ||
      "";
    out.push({ videoId, title, ago: prettyAgo(agoRaw) });
  }
  return out.slice(0, KEEP);
}

/**
 * The channel's feed: exact dates, titles (and the channel's name) per video
 * id. This is the list of *everything* the channel has put up lately — live
 * archives included, which is what the /videos tab leaves out.
 */
export function parseFeed(xml: string): { dates: Record<string, number>; titles: Record<string, string>; channel: string } {
  const dates: Record<string, number> = {};
  const titles: Record<string, string> = {};
  const text = String(xml || "");
  for (const entry of text.split("<entry>").slice(1)) {
    const videoId = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(entry)?.[1];
    if (!videoId) continue;
    const at = Date.parse(/<published>([^<]+)<\/published>/.exec(entry)?.[1] || "") || 0;
    if (at) dates[videoId] = at;
    const title = decodeXml(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] || "").trim();
    if (title) titles[videoId] = title;
  }
  const channel = decodeXml(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(text)?.[1] || "").trim();
  return { dates, titles, channel };
}

/* ------------------------------------------------------- when, and how many */

/** A rough date from YouTube's own words ("3 weeks ago") — 0 when we cannot tell. */
function approxFromAgo(ago: string, now: number): number {
  const m = /^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i.exec(String(ago || "").trim());
  if (!m) return 0;
  const unit: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };
  return now - Number(m[1]) * (unit[m[2].toLowerCase()] || 0);
}

/**
 * When a service is, as well as we know it: the feed's exact date, else
 * YouTube's own "how long ago", else nothing (0). Everything the list does —
 * ordering, and deciding which uploads are the same message — asks this.
 */
function whenOf(item: RecentService, now: number): number {
  return Number(item.at) || approxFromAgo(item.ago, now);
}

/** A headline with its spacing and case flattened, for comparing two uploads. */
function titleKey(title: string): string {
  return String(title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim();
}

/**
 * One message, however many times YouTube published it.
 *
 * A church streams a service and YouTube ends up with two or three videos of
 * it — the same headline, minutes or hours apart (a stream that drops, or a
 * re-upload) — so a list taken straight off the channel shows the same Sunday
 * twice. The office's rule: uploads whose headlines match **and whose dates are
 * nearest each other** are the one message, and the card is the service's own
 * start — the first of them — so the player opens it from the beginning
 * (SPEC note 113). Uploads with the same headline but dates further apart are
 * different services by the same name (a weekly "Sunday Service"), and uploads
 * with no date at all are never folded together.
 */
export function collapseSameMessage(items: RecentService[], now = Date.now()): RecentService[] {
  const kept: RecentService[] = [];
  const lastAt = new Map<string, number>();
  /* Oldest first, so the first upload of a message is the one that survives. */
  const byAge = [...items].sort((a, b) => whenOf(a, now) - whenOf(b, now));
  for (const item of byAge) {
    const key = titleKey(item.title);
    const at = whenOf(item, now);
    if (key) {
      const seen = lastAt.get(key) ?? 0;
      if (seen > 0 && at > 0 && Math.abs(at - seen) <= SAME_MESSAGE_MS) continue;
      /* Keep the *first* upload of the message as the one everything else is
         compared to, so a third or fourth copy folds with it too. */
      if (at > 0) lastAt.set(key, at);
    }
    kept.push(item);
  }
  return kept;
}

/** Read the channel, right now. Null when it could not be read. */
export async function fetchRecentServices(): Promise<RecentServices | null> {
  const page = channelPageUrl();
  if (!page) return null;

  const channelId = await resolveChannelId();
  const [html, xml] = await Promise.all([
    fetchText(`${page}/videos`),
    channelId ? fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`) : Promise.resolve(null),
  ]);

  const now = Date.now();
  const feed = xml ? parseFeed(xml) : { dates: {} as Record<string, number>, titles: {} as Record<string, string>, channel: "" };
  const grid = html ? parseVideosPage(html) : [];

  /* The grid's own line for each video, and everything the feed knows that the
     grid does not — which is every one of the church's Sunday services: they
     are live archives, and YouTube keeps those off the /videos tab. */
  const seen = new Set(grid.map((it) => it.videoId));
  const extra = Object.keys(feed.dates)
    .sort((a, b) => feed.dates[b] - feed.dates[a])
    .filter((videoId) => !seen.has(videoId))
    .map((videoId) => ({ videoId, title: feed.titles[videoId] || "", ago: "" }));
  const listed = [...grid, ...extra];
  if (!listed.length) return null;

  const items: RecentService[] = listed
    /* An upload with neither a date nor YouTube's own words is an *upcoming*
       broadcast, not a service that has happened: it is not a recent service. */
    .filter((it) => feed.dates[it.videoId] || it.ago)
    .map((it) => ({
      videoId: it.videoId,
      title: trimChannel(it.title, feed.channel) || it.title || feed.titles[it.videoId] || "Service",
      at: feed.dates[it.videoId] || 0,
      ago: it.ago,
      thumb: `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`,
    }));
  if (!items.length) return null;

  /* One message however many times it was published (SPEC note 113), and the
     list in the order the office's own number then picks from: nearest date
     first, which for a church means the last few services as they happened. */
  const collapsed = collapseSameMessage(items, now).sort((a, b) => whenOf(b, now) - whenOf(a, now));

  /* Never lose a service to a thin read: the channel only ever carries the
     latest uploads, so a read that comes back short must not evict the older
     services already saved — they stay until newer ones push them past KEEP. */
  const known = new Set(collapsed.map((it) => it.videoId));
  const kept = readRecentServices().items.filter((it) => !it.seeded && !known.has(it.videoId));
  const merged = [...collapsed, ...kept].sort((a, b) => whenOf(b, now) - whenOf(a, now));

  return { items: merged.slice(0, KEEP), at: now, channelId: channelId || "" };
}

/* ----------------------------------------------------------------- caching */

export function readRecentServices(): RecentServices {
  const cached = readStore<RecentServices | null>(RECENT_KEY, null);
  if (!cached || !Array.isArray(cached.items)) return { ...EMPTY };
  const now = Date.now();
  const items = cached.items
    .filter((it) => it && parseYoutubeId(String(it.videoId || "")))
    .map((it) => ({
      videoId: String(it.videoId),
      title: String(it.title || ""),
      at: Number(it.at) || 0,
      ago: String(it.ago || ""),
      thumb: String(it.thumb || `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`),
      seeded: Number(it.seeded) || 0,
    }))
    /* A seeded card is a promise that YouTube will publish the service in a
       moment; past a night it is no longer worth showing, and the read would
       have had it by then if it was ever going to. */
    .filter((it) => !it.seeded || now - it.seeded < SEED_MAX_MS);
  return { items, at: Number(cached.at) || 0, channelId: String(cached.channelId || "") };
}

function saveRecentServices(next: RecentServices) {
  writeStore(RECENT_KEY, next);
}

/* ---------------------------------------------------- "the service has ended" */

/* A service that has just come off air has to be in the list *now* — that is
   what the office asked for, and the band on the Watch live page is the first
   thing a visitor looks at after a broadcast. Two things make that happen:

   1. The office's *Stop* (or the live check flipping to "off") pokes every open
      page with `askForRecentServices()`. The pages read the channel again at
      once, and keep reading on the short cadence for a few minutes after, in
      case YouTube has not published the recording yet.
   2. The broadcast that was on air is written straight into the list as it
      stands (`seedRecentService`), so the card is there in the same second the
      stream ends rather than a minute later. The next real read replaces it
      with YouTube's own title, date and still.

   The hidden list is not consulted here: a service the office took off the site
   must not come back through the seed either (see `hiddenReplays()` in
   src/data/live.ts — the pages filter, as they do for every read). */

const listeners = new Set<() => void>();

/**
 * "Look at the channel again, now." Fired when a service starts or ends, so a
 * page that is already open does not wait out its ten-minute timer. The seed is
 * the broadcast that just ended, if we know which video it was.
 */
export function askForRecentServices(seed?: { videoId: string; title?: string } | string) {
  const videoId = parseYoutubeId(typeof seed === "string" ? seed : String(seed?.videoId || ""));
  const title = typeof seed === "string" ? "" : String(seed?.title || "");
  if (videoId) seedRecentService(videoId, title);
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      /* A listener is a page's timer — never let one break the others. */
    }
  }
}

/** Put a just-finished service at the top of the cached list, before any read. */
export function seedRecentService(videoId: string, title = "") {
  const id = parseYoutubeId(videoId);
  if (!id) return;
  const current = readRecentServices();
  if (current.items.some((it) => it.videoId === id)) return;
  const item: RecentService = {
    videoId: id,
    title: title.trim() || "Today's service",
    at: 0,
    ago: "",
    thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    seeded: Date.now(),
  };
  saveRecentServices({ items: [item, ...current.items].slice(0, KEEP), at: current.at, channelId: current.channelId });
}

/**
 * A read's own list, with the services that ended too recently for YouTube to
 * have published them kept at the top (the read replaces a card the moment it
 * carries the video itself, so the real title, date and still take over).
 */
function withSeeds(fresh: RecentService[]): RecentService[] {
  const known = new Set(fresh.map((it) => it.videoId));
  const seeds = readRecentServices().items.filter((it) => it.seeded && !known.has(it.videoId));
  if (!seeds.length) return fresh;
  return [...seeds, ...fresh].slice(0, KEEP);
}

/* --------------------------------------------------------------- the hook */

/**
 * The last few services, kept fresh while the page is open.
 *
 * `soon` is the page's hint that a service is on the clock (so the list is
 * re-read every 90 seconds rather than every ten minutes), and `liveNow` is
 * whether the church is on air: the moment that flips back to false the list is
 * re-read at once, so the service that has just ended takes its place in
 * "Recent services" without the visitor doing anything.
 */
export function useRecentServices({ soon = false, liveNow = false }: { soon?: boolean; liveNow?: boolean } = {}) {
  const [cache, setCache] = useState<RecentServices>(() => readRecentServices());
  const [checking, setChecking] = useState(false);
  const soonRef = useRef(soon);
  const liveNowRef = useRef(liveNow);
  const cacheRef = useRef(cache);
  const runRef = useRef<() => void>(() => {});
  /* When a service has just come off air the list is worth re-reading often —
     YouTube can take a minute or two to publish the recording (see
     `askForRecentServices`). */
  const burstRef = useRef(0);
  const target = String(LIVE.youtubeChannel || "").trim();

  soonRef.current = soon;
  liveNowRef.current = liveNow;
  cacheRef.current = cache;

  useEffect(() => {
    let alive = true;
    let timer = 0;

    const apply = (next: RecentServices) => {
      if (!alive) return;
      setCache(next);
      saveRecentServices(next);
    };

    /* The short cadence while a service is on the clock or on air, and for a few
       minutes after one ends — which is when YouTube publishes the recording. */
    const delay = () =>
      soonRef.current || liveNowRef.current || Date.now() < burstRef.current ? SOON_MS : IDLE_MS;

    const run = async () => {
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(run, 30_000);
        return;
      }
      setChecking(true);
      const next = await fetchRecentServices();
      if (!alive) return;
      setChecking(false);
      /* A failed read keeps the last good list: never blank the section. */
      if (next) apply({ ...next, items: withSeeds(next.items) });
      timer = window.setTimeout(run, delay());
    };

    runRef.current = () => {
      window.clearTimeout(timer);
      run();
    };

    /* A service started or ended on another page of the site (the console's
       own *Start* / *Stop*), so: show what we hold at once — the just-ended
       service is in the cache — then go and read the channel. */
    const onAsked = () => {
      burstRef.current = Date.now() + BURST_MS;
      apply(readRecentServices());
      run();
    };
    listeners.add(onAsked);

    const age = Date.now() - (readRecentServices().at || 0);
    const settled = cacheRef.current.at && age < delay();
    timer = window.setTimeout(run, settled ? 600 : 500);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      alive = false;
      listeners.delete(onAsked);
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  /* The stream just ended — the video it leaves behind is what we are after. */
  const wasLive = useRef(liveNow);
  useEffect(() => {
    const before = wasLive.current;
    wasLive.current = liveNow;
    if (before && !liveNow) runRef.current();
  }, [liveNow]);

  return { ...cache, checking } as RecentServices & { checking: boolean };
}
