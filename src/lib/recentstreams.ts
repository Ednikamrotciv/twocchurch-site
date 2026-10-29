/* Recent services: finished broadcasts read from the church's YouTube channel (feed first,
   /videos tab for words and depth; same-headline near-date uploads fold to one, note 113).
   Fails quietly; unset channel falls back to the newest messages. */

import { useEffect, useRef, useState } from "react";
import { LIVE } from "../data/live";
import { parseYoutubeId, cleanChannelInput } from "./embed";
import { liveTarget, designatedChannelId } from "./livestatus";
import { readStore, writeStore } from "./hooks";
import { serverUrl } from "./remoteserver";

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
  /** Seeded from a just-ended broadcast (replaced by the real read; expires). */
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
const IDLE_MS = 4 * 60_000;
/** …and this often while a service is on the clock or on air. */
const SOON_MS = 30_000;
/** …and how long the short cadence is kept after a service comes off air. */
const BURST_MS = 6 * 60_000;
/** How long a just-ended service waits for YouTube to publish it. */
const SEED_MAX_MS = 12 * 60 * 60 * 1000;
/** Give the proxy this long before calling a read a failure (note 372:
    three doors at the old 20 seconds each held the deployed feed up to a
    minute past a dead proxy — eight is plenty for YouTube to answer). */
const TIMEOUT_MS = 5_000;

const EMPTY: RecentServices = { items: [], at: 0, channelId: "" };

/* ------------------------------------------------------------------- target */

/** A channel id as the office might have pasted it, if it is in there. */
function channelIdIn(value: string): string {
  return /(UC[\w-]{20,24})/.exec(String(value || ""))?.[1] || "";
}

/** The channel page, from the /live address the live check watches. */
function channelPageUrl(): string {
  const target = liveTarget();
  if (!target || target.kind !== "channel") return "";
  return target.url.replace(/\/live\/*$/i, "");
}

/** The published channel's own id, synchronously known: a UC id pasted
    straight in answers directly; otherwise the resolved id the reads saved
    beside the same cleaned value; otherwise the designated map (so @twocorg
    answers with no read at all); otherwise nothing is known yet. The moment a
    @channel is published, every @twocorg-only door below opens for it — its
    own list is kept, other channels' lists go, and grid-only items wait for
    the feed exactly like the church's. */
export function publishedChannelId(): string {
  const pasted = cleanChannelInput(LIVE.youtubeChannel);
  if (!pasted) return "";
  const direct = channelIdIn(pasted);
  if (direct) return direct;
  try {
    const cached = readStore<{ value?: string; id?: string } | null>(CHANNEL_KEY, null);
    if (cached && cached.value === pasted && cached.id) return String(cached.id);
  } catch {
    /* uncached — fall through to the map */
  }
  return designatedChannelId(pasted);
}
/** The channel id behind the office's channel setting, resolving a handle once. */
async function resolveChannelId(): Promise<string> {
  /* Cleaned (note 321): a doubled "@" must resolve like the handle it is. */
  const pasted = cleanChannelInput(LIVE.youtubeChannel);
  if (!pasted) return "";
  const direct = channelIdIn(pasted);
  if (direct) return direct;
  /* The designated handle answers from its baked id (note 372): @twocorg is
     known without any page read, so the first feed on a fresh browser skips
     the whole proxy cascade instead of waiting it out. */
  const designated = designatedChannelId(pasted);
  if (designated) return designated;

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

/** Fetch a YouTube page: same-origin / office-server proxy, else public CORS
    proxy. All doors race — first VALID answer wins, never the slowest door. */
async function fetchText(url: string): Promise<string | null> {
  try {
    return await firstValidText([
      fetchTextSameOrigin(url),
      fetchTextOffice(url),
      fetchTextRemote(url),
    ]);
  } catch {
    return null;
  }
}

/** First valid (non-null) door wins; rejects/nulls are ignored until every
    door settles, then null. */
function firstValidText(jobs: Promise<string | null>[]): Promise<string | null> {
  return new Promise((resolve) => {
    let pending = jobs.length;
    let done = false;
    if (!pending) {
      resolve(null);
      return;
    }
    for (const job of jobs) {
      Promise.resolve(job).then(
        (value) => {
          if (done) return;
          if (typeof value === "string" && value.length > 0) {
            done = true;
            resolve(value);
            return;
          }
          pending -= 1;
          if (pending <= 0 && !done) {
            done = true;
            resolve(null);
          }
        },
        () => {
          if (done) return;
          pending -= 1;
          if (pending <= 0) {
            done = true;
            resolve(null);
          }
        }
      );
    }
  });
}

/** True when this body is really what was asked for — not a static host's SPA
    fallback index.html answering /__yt with 200. Feed URLs carry entries;
    channel pages carry the video grid scaffolding. */
function isExpectedBody(url: string, text: string): boolean {
  const body = String(text || "");
  if (body.length < 500) return false;
  if (/\/feeds\/videos\.xml/i.test(String(url || ""))) {
    return /<entry>/.test(body) || /<yt:videoId>/.test(body);
  }
  return /lockupMetadataViewModel/.test(body) || /ytInitialData/.test(body) || /"videoDetails":\{/.test(body);
}

/* Last resort for hosts with no proxy: a free public CORS proxy.
   Only reached when no office door is open, and a miss
   degrades exactly as before (the last good list stands). */
async function fetchTextRemote(url: string): Promise<string | null> {
  try {
    const res = await withTimeout(
      fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { cache: "no-store" }),
      TIMEOUT_MS
    );
    if (!res || !res.ok) return null;
    const text = await res.text();
    if (typeof text !== "string" || text.length === 0) return null;
    /* An error page from the proxy is not the channel — it must not beat the
       doors that carry the real list. */
    if (!isExpectedBody(url, text)) return null;
    return text;
  } catch {
    return null;
  }
}

/** Same-origin YouTube read (`scripts/serve.mjs` /__yt, note 364): the office
    server AND the deployed server both answer it, so local runs and deployed
    visitors read through their own host instead of the dead public proxies.
    Static hosts answer nothing here and fall through below. */
async function fetchTextSameOrigin(url: string): Promise<string | null> {
  try {
    const res = await withTimeout(fetch(`/__yt?url=${encodeURIComponent(url)}`, { cache: "no-store" }), TIMEOUT_MS);
    if (!res || !res.ok) return null;
    const text = await res.text();
    if (typeof text !== "string" || text.length === 0) return null;
    /* Static hosts answer /__yt with the SPA fallback (200 index.html) — not
       YouTube, so it must not beat the doors that work. */
    if (!isExpectedBody(url, text)) return null;
    return text;
  } catch {
    return null;
  }
}

/** Office-server YouTube read for deployed copies joined to it. Skipped when
    this copy stands alone (the public proxy above covers that). */
async function fetchTextOffice(url: string): Promise<string | null> {
  try {
    const base = serverUrl();
    if (!base) return null;
    const res = await withTimeout(fetch(`${base}/__yt?url=${encodeURIComponent(url)}`, { cache: "no-store" }), TIMEOUT_MS);
    if (!res || !res.ok) return null;
    const text = await res.text();
    if (typeof text !== "string" || text.length === 0) return null;
    if (!isExpectedBody(url, text)) return null;
    return text;
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

/** "2w ago" in words; YouTube's page variants disagree. */
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

/** The /videos list: newest first, no Shorts, with YouTube's age line each. */
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

/** The channel feed: exact dates and titles per id (live archives included). */
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

/** A service's moment as best known: feed date, else "how long ago", else 0. */
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

/** Same-headline near-date uploads are one message; the card is its start (note 113). */
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

  /* Only @twocorg's own videos paint (note 418): the channel feed is the proof
     of ownership — every upload the handle publishes is in it — while a walled
     /videos grid can smuggle in ads, autoplay and related uploads from other
     channels. Grid-only items with no feed date are unproven, so on the
     designated channel they wait for the feed instead of painting; anywhere
     else the grid reads exactly as before. */
  const designatedRead = !!publishedChannelId();
  const items: RecentService[] = listed
    /* An upload with neither a date nor YouTube's own words is an *upcoming*
       broadcast, not a service that has happened: it is not a recent service. */
    .filter((it) => feed.dates[it.videoId] || it.ago)
    .filter((it) => !designatedRead || !!feed.dates[it.videoId])
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
  /* Only @twocorg's own videos stay (note 418): a kept card without a feed date
     was never proven the handle's — wall garbage and foreign endings linger
     exactly here — so on the designated channel dateless keeps go. Fresh
     just-ended seeds are not keeps (they never reach this filter). */
  const kept = readRecentServices().items.filter(
    (it) => !it.seeded && !known.has(it.videoId) && (!designatedRead || Number(it.at) > 0)
  );
  const merged = [...collapsed, ...kept].sort((a, b) => whenOf(b, now) - whenOf(a, now));

  return { items: merged.slice(0, KEEP), at: now, channelId: channelId || "" };
}

/* -------------------------------------- previous lives of any channel */

/** Streams-tab addresses for a pasted channel plus a known id, fastest first. */
function streamsPagesFor(pasted: string, channelId: string): string[] {
  const out: string[] = [];
  if (channelId) out.push(`https://www.youtube.com/channel/${channelId}/streams`);
  const raw = String(pasted || "").trim();
  if (/^https?:\/\//i.test(raw)) out.push(raw.replace(/\/+$/, "") + "/streams");
  else if (/^UC[\w-]{20,24}$/.test(raw)) out.push(`https://www.youtube.com/channel/${raw}/streams`);
  else {
    const m = /^@?([\w.-]+)$/.exec(raw);
    if (m) out.push(`https://www.youtube.com/@${m[1]}/streams`);
  }
  return [...new Set(out)];
}

/** Channel pages for id resolution from a pasted value, mirrors the bake. */
function channelPagesFor(pasted: string): string[] {
  const raw = String(pasted || "").trim();
  if (!raw) return [];
  if (/^https?:\/\//i.test(raw)) return [raw.replace(/\/+$/, "")];
  if (/^UC[\w-]{20,24}$/.test(raw)) return [`https://www.youtube.com/channel/${raw}`];
  const m = /^@?([\w.-]+)$/.exec(raw);
  if (m) return [`https://www.youtube.com/@${m[1]}`];
  return [];
}

/** The channel id behind any pasted value (parameterized twin of resolveChannelId). */
async function resolveChannelIdFor(pasted: string): Promise<string> {
  if (!pasted) return "";
  const direct = channelIdIn(pasted);
  if (direct) return direct;
  const designated = designatedChannelId(pasted);
  if (designated) return designated;
  const cached = readStore<{ value?: string; id?: string } | null>(CHANNEL_KEY, null);
  if (cached && cached.value === pasted && cached.id) return String(cached.id);
  for (const page of channelPagesFor(pasted)) {
    const html = await fetchText(page);
    if (!html) continue;
    const id =
      /"externalId":"(UC[\w-]{20,24})"/.exec(html)?.[1] ||
      /"channelId":"(UC[\w-]{20,24})"/.exec(html)?.[1] ||
      /youtube\.com\/channel\/(UC[\w-]{20,24})/.exec(html)?.[1] ||
      "";
    if (id) {
      writeStore(CHANNEL_KEY, { value: pasted, id });
      return id;
    }
  }
  return "";
}

/** Ago lines that are not a finished broadcast: upcoming, premieres, live-now. */
function isUnfinishedAgo(ago: string): boolean {
  return /upcoming|premier|scheduled|watching|started streaming|^\s*live\b/i.test(String(ago || ""));
}

/** Any channel's previous live broadcasts, newest first (the admin read): the
    /streams tab IS the live list, so regular uploads never qualify — the feed
    only dates them. Ended broadcasts only: upcoming and live-now markers are
    refused, and feed dates in the future with them. Fails quietly (null), so
    the last good list stands. */
export async function fetchPreviousLives(channelInput: string, depth = KEEP): Promise<RecentServices | null> {
  const pasted = cleanChannelInput(channelInput);
  if (!pasted) return null;
  const channelId = await resolveChannelIdFor(pasted);
  let html: string | null = null;
  for (const page of streamsPagesFor(pasted, channelId)) {
    const h = await fetchText(page);
    if (h && h.includes("lockupMetadataViewModel")) {
      html = h;
      break;
    }
  }
  /* No readable live list, no previous lives: a feed-only read would mix
     regular uploads in, so the last good list stands instead. */
  if (!html) return null;
  const xml = channelId ? await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`) : null;
  const feed = xml
    ? parseFeed(xml)
    : { dates: {} as Record<string, number>, titles: {} as Record<string, string>, channel: "" };
  const grid = parseVideosPage(html);
  const now = Date.now();
  const items: RecentService[] = grid
    .filter((it) => !isUnfinishedAgo(it.ago))
    .filter((it) => feed.dates[it.videoId] || it.ago)
    .map((it) => ({
      videoId: it.videoId,
      title: trimChannel(it.title, feed.channel) || it.title || feed.titles[it.videoId] || "Service",
      at: feed.dates[it.videoId] || approxFromAgo(it.ago, now),
      ago: it.ago,
      thumb: `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`,
    }))
    /* Scheduled premieres sit in the feed with tomorrow's date — not previous. */
    .filter((it) => !(it.at > now + 30 * 60_000));
  if (!items.length) return null;
  /* One message however many times it was published, newest first. */
  const collapsed = collapseSameMessage(items, now).sort((a, b) => whenOf(b, now) - whenOf(a, now));
  return { items: collapsed.slice(0, Math.max(1, depth)), at: now, channelId: channelId || "" };
}

/** Wake every open recents read at once (Stop, Play and autostop seed into it). */
export function subscribeRecentServices(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* The designated channel's previous services, baked into the code (note 364):
   every public proxy is down and the deployed bake is empty until seed.json is
   deployed — so a standalone visitor would see no recents and no still on the
   screen. With @twocorg published, this list stands in, newest first (read off
   the channel feed on 2026-10-12). A live read, the cache, or the shipped bake
   always wins over it; it never saves itself anywhere. */
const DESIGNATED_FALLBACK_AT = 1791755357000;
const DESIGNATED_FALLBACK_ITEMS: Array<{ videoId: string; title: string; at: number }> = [
  { videoId: "s4bLaGUNet4", title: "SUNDAY SERVICE, 11TH OCT. 2026", at: 1791755357000 },
  { videoId: "aT5IeCtJHFw", title: "THANKSGIVING SUNDAY SERVICE 3RD OCT. 2026", at: 1791151867000 },
  { videoId: "3uqJoUXKds4", title: "YOUTH SUNDAY/COMMUNION SERVICE,  27TH. SEPT. 2026.", at: 1790547921000 },
  { videoId: "OV6XtrNPGgo", title: "TEENS WEEK 2026. SUNDAY SERVICE, 20TH. SEPT. 2026.", at: 1789940337000 },
  { videoId: "BgF97PIYPe8", title: "TEENS WEEK 2026. SUNDAY SERVICE, 20TH. SEPT. 2026.", at: 1789899897000 },
  { videoId: "rmdEvZ_ZOXo", title: "YOUTH SUNDAY SERVICE, 20TH. SEPT. 2026.", at: 1789890601000 },
  { videoId: "ddWq2WYrmZ8", title: "SUNDAY SERVICE, 13TH SEPT. 2026", at: 1789335610000 },
  { videoId: "HmVTgKwA6rY", title: "FAMILY ESSENTIALS AFRICA {BUILDING STRONG MEN OF GOD, FAMILIES AND CHURCHES} SEPT 8TH 2026.", at: 1788907035000 },
  { videoId: "eyGDEZplxJw", title: "FAMILY ESSENTIALS AFRICA {BUILDING STRONG MEN OF GOD, FAMILIES AND CHURCHES} SEPT 8TH 2026.", at: 1788904484000 },
  { videoId: "akE7Klt3a8w", title: "FAMILY ESSENTIALS AFRICA {BUILDING STRONG MEN OF GOD, FAMILIES AND CHURCHES} SEPT 7TH 2026.", at: 1788822563000 },
  { videoId: "KCGWV3jWROE", title: "FAMILY ESSENTIALS AFRICA {BUILDING STRONG MEN OF GOD, FAMILIES AND CHURCHES} SEPT 7TH 2026.", at: 1788788138000 },
  { videoId: "_PD-k6SqPvg", title: "THANKSGIVING SUNDAY SERVICE, 6TH SEPT. 2026", at: 1788731683000 },
  { videoId: "eu3xQ-XCHv4", title: "THANKSGIVING SUNDAY SERVICE, 6TH SEPT. 2026", at: 1788681346000 },
  { videoId: "gVJP8wlL9dM", title: "It Will End in Praise - Evang Steve K Pelemo", at: 1788419927000 },
  { videoId: "suLunbMiN78", title: "SUNDAY SERVICE, AUG. 30TH. 2026", at: 1788127709000 },
];
/** The fallback list — only for the designated channel, [] anywhere else. A
    published @channel takes the designation, but the baked items stay
    @twocorg's own: nothing else's lives can ship in the code, so anywhere
    but @twocorg the live read and the shipped bake fill the card instead. */
export function designatedFallback(): RecentServices {
  const designated = designatedChannelId();
  /* The baked items are @twocorg's own: serve them only under that
     designation — anywhere else (including a published @channel, whose own
     lives no code can ship) the live read and the shipped bake fill the
     card instead. */
  if (!designated || designated !== designatedChannelId("@twocorg")) return { ...EMPTY };
  return {
    items: DESIGNATED_FALLBACK_ITEMS.map((it) => ({
      videoId: it.videoId,
      title: it.title,
      at: it.at,
      ago: "",
      thumb: `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`,
    })),
    at: DESIGNATED_FALLBACK_AT,
    channelId: designated,
  };
}

/* ----------------------------------------------------------------- caching */

export function readRecentServices(): RecentServices {
  const cached = readStore<RecentServices | null>(RECENT_KEY, null);
  if (!cached || !Array.isArray(cached.items)) return designatedFallback();
  /* Only the designated channel's list (note 360): a cache saved for another
     channel is cleared, never merged — old debugging videos must not ride a
     fresh read forever. Seeds and empty caches pass through; the next read
     (or the baked @twocorg list) fills the card back in. */
  const cachedChannelId = String(cached.channelId || "");
  /* A published @channel takes all @twocorg does: its own list is kept, any
     other channel's list falls to the fallback. */
  const designated = publishedChannelId();
  if (designated && cachedChannelId && cachedChannelId !== designated) return designatedFallback();
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
    .filter((it) => !it.seeded || now - it.seeded < SEED_MAX_MS)
    /* Only @twocorg's own videos paint (note 418): a cached card without a
       feed date was never proven the handle's — wall garbage and foreign
       endings linger exactly here — so on the designated channel dateless
       cards go, except a fresh just-ended seed still waiting on YouTube. */
    .filter((it) => !designated || Number(it.at) > 0 || (it.seeded && now - it.seeded < SEED_MAX_MS));
  if (!items.length) return designatedFallback();
  return { items, at: Number(cached.at) || 0, channelId: String(cached.channelId || "") };
}

function saveRecentServices(next: RecentServices) {
  writeStore(RECENT_KEY, next);
}

/* A proven new update drops the old card once (note 362): the next read, or
   the shipped bake, fills it back in. Seeds are never special-cased here — a
   just-ended service is on YouTube by the next read. */
export function clearRecentCaches(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(RECENT_KEY);
    localStorage.removeItem(CHANNEL_KEY);
  } catch {
    /* a locked store keeps its cache — the read gate still drops foreign lists */
  }
}

/** Paint the baked list; a fresher live read always wins, seeds stay on top. */
export function applyBakedRecent(seed: unknown) {
  try {
    const raw = (seed as { recent?: { items?: unknown; at?: unknown; channelId?: unknown } } | null)?.recent;
    if (!raw || !Array.isArray(raw.items) || !raw.items.length) return;
    const at = Number(raw.at) || 0;
    const current = readRecentServices();
    if (current.at && at && current.at >= at) return;
    const fresh: RecentService[] = [];
    for (const entry of raw.items) {
      const it = entry as Partial<RecentService>;
      const videoId = parseYoutubeId(String(it?.videoId || ""));
      if (!videoId) continue;
      fresh.push({
        videoId,
        title: String(it?.title || "Service"),
        at: Number(it?.at) || 0,
        ago: String(it?.ago || ""),
        thumb: String(it?.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
      });
      if (fresh.length >= KEEP) break;
    }
    if (!fresh.length) return;
    /* Only the published channel's own bake paints: a bake stamped for another
       channel (built while the field named a guest or a debugging handle)
       never reaches the card. Unstamped older bakes cannot be judged and
       still paint. */
    if (publishedChannelId()) {
      const bakedFor = String(raw.channelId || "");
      if (bakedFor && bakedFor !== publishedChannelId()) return;
    }
    const known = new Set(fresh.map((it) => it.videoId));
    const seeds = current.items.filter((it) => it.seeded && !known.has(it.videoId));
    saveRecentServices({ items: [...seeds, ...fresh].slice(0, KEEP), at: at || Date.now(), channelId: String(raw.channelId || "") });
  } catch {
    /* a bad bake never blanks a good list */
  }
}

/* ---------------------------------------------------- "the service has ended" */

/* A just-ended service lists now: open pages re-read, plus a same-second seed. Take-offs stay off. */

const listeners = new Set<() => void>();

/** Re-read the channel now (service started/ended); optional just-ended seed. */
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

/** A read's list, with too-fresh-to-publish endings kept on top. */
function withSeeds(fresh: RecentService[]): RecentService[] {
  const known = new Set(fresh.map((it) => it.videoId));
  const seeds = readRecentServices().items.filter((it) => it.seeded && !known.has(it.videoId));
  if (!seeds.length) return fresh;
  return [...seeds, ...fresh].slice(0, KEEP);
}

/* --------------------------------------------------------------- the hook */

/** Recent services, kept fresh while open; re-reads at once when air flips off. */
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
  /* Cleaned (note 321): follows the same address the live check watches. */
  const target = cleanChannelInput(LIVE.youtubeChannel);

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
