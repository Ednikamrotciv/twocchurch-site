/* ============================================================================
   Are we on air right now?

   The Watch live page does not guess from the clock and the office does not
   have to flip a switch: the page asks YouTube whether the church's channel
   (or the stream link the office pasted) is broadcasting at this moment, and
   the screen follows.

   How the answer is found — and why it is not a plain fetch():

   - YouTube sends no CORS headers, so a browser `fetch` of youtube.com is
     refused ("Failed to fetch"). The request therefore goes through
     perchance's own proxy, `superFetch` (main.pjs imports super-fetch-plugin),
     which is the only door a static page has to that HTML.
   - There is no public keyless "is this channel live" API, so we read the
     channel's own /live page and look for the one marker YouTube prints only
     while broadcasting: `"isLiveNow":true` (the player's microformat, printed
     with the broadcast's start time). It is gone the moment the stream ends, so
     the check flips back by itself, and a page that carries no marker at all
     reads as "off". Two nearby flags are traps and are NOT used:
     `"isLiveContent":true` (a finished stream keeps it forever), and
     `"isLive":true` — that one also sits in the *view count* renderer of a
     finished or scheduled broadcast, so reading it would leave a quiet week
     looking like "we are live now" (found on the church's own channel, TWOC:
     /@twocorg/live hands back its last stream with `"isLiveNow":false` beside
     `"isLive":true`, and only `isLiveNow` tells the truth).
   - The video id and headline of the running broadcast come out of the same
     page (the canonical watch link and <meta name="title">), so the player can
     open the stream the office never had to tell us about.

   The answer is cached in localStorage (so a reload paints the last known
   truth before the network answers) and re-checked on a timer: every 45s when
   a service is on the clock, every 4 minutes otherwise. A failed check is
   "unknown" — never "not live" — so a flaky proxy can only fall back to the
   old behaviour, not fake an ended stream.

   Two things were added on top of that answer:

   - **It remembers that a broadcast *ended*.** When a check that follows a
     "live" one comes back "off", the moment of that answer is kept on the
     status (`endedAt`) along with the video that was on air, so the office's
     drawer can do what it does on *Stop* by itself — `src/lib/autostop.ts`.
     A broadcast that comes back clears it again.
   - **Facebook is asked too, when the drawer asks for it.** Facebook serves a
     browser that is not signed in no live information it can be trusted for —
     a page's HTML is the same whether it is broadcasting or not — so this probe
     can only ever *confirm* a broadcast (`facebookTarget` /
     `parseFacebookLivePage`); it never says one has stopped, and it is only
     made from the office's own drawer (`checkLiveStream({ facebook: true })`),
     never from a visitor's page. In practice the stop follows YouTube, which is
     also where *Recent services* comes from.

   And one thing ties it to the rest of the site (SPEC note 133): **the answer
   is the site's, not the page's.** It is kept here at module scope and read by
   everything that shows a live state — through `onAir()` in src/lib/store.ts —
   so a broadcast that starts off the schedule puts the whole site on air, and
   one that ends takes *Live now* off in every place it was shown. There is one
   poll for the page, not one per reader (see *the shared answer*, below).
   ========================================================================== */

import { useEffect, useSyncExternalStore } from "react";
import { LIVE } from "../data/live";
import { parseYoutubeId } from "./embed";
import { readStore, writeStore } from "./hooks";

export type LiveState = "live" | "off" | "unset" | "unknown";

/** The platforms a broadcast can be found on. */
export type LivePlatform = "youtube" | "facebook";

export type LiveStatus = {
  /** live = broadcasting now · off = checked, not live · unset = nothing to
      check · unknown = the check could not be made (offline, proxy down). */
  state: LiveState;
  /** Which platform the running broadcast was found on ("" when not on air). */
  platform: LivePlatform | "";
  /** The video id of the broadcast that is on air, when we know it. */
  videoId: string;
  /** The stream's own headline, when YouTube gives us one. */
  title: string;
  /** When the answer was fetched (ms). */
  checkedAt: number;
  /**
   * When a broadcast we had *seen* live stopped (ms) — 0 when this browser has
   * not watched one end. The video id and headline above are kept with it, so
   * the drawer can seed the finished service into *Recent services* and end the
   * session the same way its *Stop* button does (`src/lib/autostop.ts`).
   */
  endedAt: number;
};

export const LIVE_STATUS_KEY = "wom.livestatus";

/** A status younger than this is trusted on mount instead of re-checked. */
const FRESH_MS = 45_000;
/** Give the proxy this long before calling the check a failure. */
const CHECK_TIMEOUT_MS = 15_000;
/** Poll cadence: a broadcast is expected (on the clock) vs. the quiet week. */
export const SOON_MS = 45_000;
export const IDLE_MS = 180_000;

const EMPTY: LiveStatus = { state: "unset", platform: "", videoId: "", title: "", checkedAt: 0, endedAt: 0 };

/* --------------------------------------------------------------- the target */

/**
 * Where to ask. The channel wins when the office has set one — a channel keeps
 * its /live address forever, so the check follows whichever broadcast is on
 * that day without anyone editing the site. Otherwise the stream link is
 * checked directly (the older way of doing it).
 */
export function liveTarget(): { url: string; kind: "channel" | "video" } | null {
  const raw = String(LIVE.youtubeChannel || "").trim();
  if (raw) {
    /* A channel id, a handle (@name or bare name), or any of the YouTube
       channel link shapes. Each one becomes the channel's /live page, which
       serves the running broadcast when there is one and the channel's own
       Live tab when there is not. */
    const id = /(UC[\w-]{20,24})/.exec(raw);
    if (id) return { url: `https://www.youtube.com/channel/${id[1]}/live`, kind: "channel" };
    const at = /youtube\.com\/@([\w.-]+)/i.exec(raw) || /^@([\w.-]+)$/.exec(raw);
    if (at) return { url: `https://www.youtube.com/@${at[1]}/live`, kind: "channel" };
    const legacy = /youtube\.com\/(?:c|user)\/([\w.-]+)/i.exec(raw);
    if (legacy) return { url: `https://www.youtube.com/${/\/user\//i.test(raw) ? "user" : "c"}/${legacy[1]}/live`, kind: "channel" };
    if (/^[\w.-]+$/.test(raw)) return { url: `https://www.youtube.com/@${raw}/live`, kind: "channel" };
    return null;
  }
  const video = parseYoutubeId(LIVE.youtubeId || "");
  if (video) return { url: `https://www.youtube.com/watch?v=${video}`, kind: "video" };
  return null;
}

/**
 * Where to ask Facebook. The office may have pasted the day's live video, or
 * the church's page; a page address is asked at its own /live tab, where a
 * broadcast the page is running appears. Empty when the office has not set one.
 */
export function facebookTarget(): string {
  const raw = String(LIVE.facebookUrl || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    const url = raw.replace(/[?#].*$/, "").replace(/\/+$/, "");
    /* A page's own address (facebook.com/church, but not facebook.com/watch…,
       /videos/…, a reel or a share link) → the page's /live tab. */
    if (/facebook\.com\/[^/]+$/i.test(url) && !/facebook\.com\/(?:watch|video|videos|reel|share|permalink)/i.test(url)) {
      return url + "/live";
    }
    return url;
  }
  if (/^\/?[\w.-]+$/.test(raw)) return `https://www.facebook.com/${raw.replace(/^\/+/, "")}/live`;
  return "";
}

/* ---------------------------------------------------------------- the answer */

function decodeEntities(value: string): string {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Read a YouTube page: was it readable at all, is it broadcasting, and which
 * video is it?
 *
 * `read` is what keeps a page we could not understand from passing as an
 * ending. YouTube answers with a consent wall, a bot check or a bare error
 * page now and then, and none of them carries any of YouTube's own scaffolding
 * — those must come back as "we did not get an answer", because an "off" answer
 * is what stops a site that is on air (`src/lib/autostop.ts`).
 */
export function parseLivePage(html: string): { read: boolean; live: boolean; videoId: string; title: string } {
  const text = String(html || "");
  /* YouTube's own pages all carry the inlined page model — a consent wall or an
     error page carries none of it. */
  const read = /ytInitialData/.test(text) || /"videoDetails":\{/.test(text);
  /* Only `isLiveNow` (and a player that has already produced a live manifest)
     means *broadcasting right now*. `"isLive":true` is NOT a live marker — a
     finished stream's page carries it in the view count renderer, which once
     made the church's own channel read as on air (SPEC note 112). */
  const live = read && (/"isLiveNow":true/.test(text) || /"hlsManifestUrl":"https?:\/\//.test(text));
  if (!live) return { read, live: false, videoId: "", title: "" };
  const canonical = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(text);
  const details = /"videoDetails":\{[^}]*?"videoId":"([\w-]{11})"/.exec(text);
  const any = /"videoId":"([\w-]{11})"/.exec(text);
  const meta = /<meta name="title" content="([^"]*)"/.exec(text);
  const videoTitle = /"videoDetails":\{[^}]*?"title":"((?:[^"\\]|\\.)*)"/.exec(text);
  return {
    read,
    live: true,
    videoId: canonical?.[1] || details?.[1] || any?.[1] || "",
    title: decodeEntities(meta?.[1] || (videoTitle ? videoTitle[1].replace(/\\"/g, '"') : "") || ""),
  };
}

/**
 * Read a Facebook page: is it broadcasting? Facebook shows a signed-out browser
 * nothing it can be trusted for — the same HTML comes back whether a page is
 * live or not — so this can only ever *confirm* a broadcast, and it takes two
 * markers to do it (a finished live video keeps "was live" marks of its own, and
 * a site must never be kept on air by one). No answer means "no answer".
 */
export function parseFacebookLivePage(html: string): { live: boolean; videoId: string; title: string } {
  const text = String(html || "");
  const marked =
    /"is_live_stream"\s*:\s*(?:true|1)/i.test(text) ||
    /"isLiveStream"\s*:\s*true/i.test(text) ||
    /"is_live_broadcast"\s*:\s*true/i.test(text);
  const running = /"(?:video_status|live_status|broadcast_status)"\s*:\s*"LIVE"/i.test(text);
  if (!marked || !running) return { live: false, videoId: "", title: "" };
  return {
    live: true,
    videoId: /"video_?[Ii]d"\s*:\s*"?(\d{8,25})/.exec(text)?.[1] || "",
    title: decodeEntities(/<meta property="og:title" content="([^"]*)"/.exec(text)?.[1] || ""),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("live check timed out")), ms);
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

/** The channel page's HTML: the local dev server proxies it (scripts/serve.mjs
    /__yt — YouTube sends no CORS headers, so a plain fetch is refused and the
    superFetch plugin only exists on the live site), else through perchance's
    proxy. Null when unreachable. */
async function fetchPage(url: string): Promise<string | null> {
  const local = await fetchPageLocal(url);
  if (local) return local;
  const proxy = (window as any).root?.superFetch;
  if (typeof proxy !== "function") return null; // the plugin has not loaded yet
  try {
    const res = await withTimeout(proxy(url) as Promise<Response>, CHECK_TIMEOUT_MS);
    if (!res || res.ok === false) return null;
    const text = await res.text();
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch (err) {
    return null;
  }
}

/** Same-origin YouTube read for local runs. Only attempted on a local host, so
    the live site never pays for the detour. */
async function fetchPageLocal(url: string): Promise<string | null> {
  try {
    const host = window.location?.hostname || "";
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "") return null;
    const res = await withTimeout(fetch(`/__yt?url=${encodeURIComponent(url)}`, { cache: "no-store" }), CHECK_TIMEOUT_MS);
    if (!res || !res.ok) return null;
    const text = await res.text();
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/** Ask YouTube whether we are broadcasting, right now. */
export async function checkLiveStream(opts: { facebook?: boolean } = {}): Promise<LiveStatus> {
  const target = liveTarget();
  const fbUrl = opts.facebook ? facebookTarget() : "";
  if (!target && !fbUrl) return { ...EMPTY, state: "unset", checkedAt: Date.now() };

  const html = target ? await fetchPage(target.url) : null;
  const youtube: { state: LiveState; videoId: string; title: string } = !target
    ? { state: "unset", videoId: "", title: "" }
    : html === null
    ? { state: "unknown", videoId: "", title: "" }
    : (() => {
        const parsed = parseLivePage(html);
        /* A page we could not read is not an ending — only a real YouTube page
           that says nothing about a broadcast is (see `parseLivePage`). */
        if (!parsed.read) return { state: "unknown" as const, videoId: "", title: "" };
        return { state: parsed.live ? ("live" as const) : ("off" as const), videoId: parsed.videoId, title: parsed.title };
      })();

  /* Facebook is asked only when YouTube has not already answered "live" — it is
     the office's drawer that asks, and this is the one case it can add
     something: a service that is only on Facebook (SPEC note 111). */
  let facebook: { state: LiveState; videoId: string; title: string } = { state: "unset", videoId: "", title: "" };
  if (fbUrl && youtube.state !== "live") {
    const fbHtml = await fetchPage(fbUrl);
    if (fbHtml !== null) {
      const parsed = parseFacebookLivePage(fbHtml);
      facebook = { state: parsed.live ? "live" : "unknown", videoId: parsed.videoId, title: parsed.title };
    }
  }

  const found =
    youtube.state === "live"
      ? { platform: "youtube" as LivePlatform, videoId: youtube.videoId, title: youtube.title }
      : facebook.state === "live"
      ? { platform: "facebook" as LivePlatform, videoId: facebook.videoId, title: facebook.title }
      : null;

  const state: LiveState = found
    ? "live"
    : youtube.state === "off" || facebook.state === "off"
    ? "off"
    : youtube.state === "unset" && facebook.state === "unset"
    ? "unset"
    : "unknown";

  const checkedAt = Date.now();
  const next: LiveStatus = { state, platform: found?.platform || "", videoId: found?.videoId || "", title: found?.title || "", checkedAt, endedAt: 0 };

  /* A broadcast we were watching has stopped: keep the moment, and the video it
     was, so the drawer can end the session and seed *Recent services* with it
     (`src/lib/autostop.ts`). The ending sticks until a broadcast comes back —
     every later "off" answer carries the same moment, or the drawer would have
     one answer to end a service and never see it again. Everything else is a
     fresh answer. */
  const before = readLiveStatus();
  if (state === "off" && (before.state === "live" || before.endedAt > 0)) {
    /* The moment it ended is the first answer that says it has; every answer
       after that carries the same moment and the video it was. */
    next.endedAt = before.state === "live" ? checkedAt : before.endedAt;
    next.videoId = before.videoId;
    next.title = before.title;
    next.platform = before.platform;
  }
  return next;
}

/* ------------------------------------------------------------------ caching */

export function readLiveStatus(): LiveStatus {
  const cached = readStore<LiveStatus | null>(LIVE_STATUS_KEY, null);
  if (!cached || typeof cached !== "object" || typeof cached.state !== "string") return { ...EMPTY };
  return {
    state: (cached.state as LiveState) || "unset",
    platform: cached.platform === "youtube" || cached.platform === "facebook" ? cached.platform : "",
    videoId: String(cached.videoId || ""),
    title: String(cached.title || ""),
    checkedAt: Number(cached.checkedAt) || 0,
    endedAt: Number(cached.endedAt) || 0,
  };
}

function saveLiveStatus(status: LiveStatus) {
  /* "unknown" is not worth remembering — it would only make the next visit
     start out more pessimistic than it needs to be. */
  if (status.state === "unknown") return;
  writeStore(LIVE_STATUS_KEY, status);
}

/* ------------------------------------------------------- the shared answer

   The answer belongs to the *page*, not to the component that happens to ask
   for it. Everything that shows a live state reads `onAir()` (`src/lib/store.ts`),
   which asks `liveNow()` / `liveEndedAt()` below, so a per-component poll would
   mean one channel page fetched several times for one answer — and several
   timers free to disagree (the badge saying live while the panel says the
   stream has ended).

   So the answer is kept here at module scope and the polling is
   reference-counted: the first component to ask starts it, the last one to
   leave stops it, and the callers' own needs are merged (the short cadence if
   *any* caller is expecting a service, Facebook if any caller wants it).
   ========================================================================== */

export type LiveSnapshot = { status: LiveStatus; checking: boolean };

/** What each mounted reader of the check is asking for. */
type Watcher = { soon: boolean; facebook: boolean };

let snapshot: LiveSnapshot = { status: readLiveStatus(), checking: false };
const watchers = new Set<Watcher>();
const listeners = new Set<() => void>();
let timer = 0;
let polling = false;
/** When the last answer was fetched (ms) — the freshness clock. */
let lastCheckAt = snapshot.status.checkedAt;
/** The address the last answer was about, so a new one is checked at once. */
let lastTarget = "";

function emit() {
  listeners.forEach((fn) => fn());
}

function sameStatus(a: LiveStatus, b: LiveStatus) {
  return (
    a.state === b.state &&
    a.platform === b.platform &&
    a.videoId === b.videoId &&
    a.title === b.title &&
    a.checkedAt === b.checkedAt &&
    a.endedAt === b.endedAt
  );
}

function publish(patch: Partial<LiveSnapshot>) {
  const next: LiveSnapshot = { ...snapshot, ...patch };
  if (next.checking === snapshot.checking && sameStatus(next.status, snapshot.status)) return;
  snapshot = next;
  emit();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const readSnapshot = () => snapshot;

/** Is the church broadcasting right now, per the last answer? The stream's own word. */
export function liveNow(): boolean {
  return snapshot.status.state === "live";
}

/**
 * The moment the broadcast this browser *watched* ended (0 when none has) —
 * the stream's way of stopping the site, as `LIVE.liveCut` is the office's
 * (see `onAir` in src/lib/store.ts).
 */
export function liveEndedAt(): number {
  return Number(snapshot.status.endedAt) || 0;
}

/** The answer, kept fresh for as long as the component is on screen. */
export function useLiveStatus(): LiveSnapshot {
  return useSyncExternalStore(subscribe, readSnapshot, readSnapshot);
}

/* --------------------------------------------------------------- the poller */

/** The short cadence while any caller expects a service (or one is running). */
function wantsSoon() {
  if (snapshot.status.state === "live") return true;
  for (const watcher of watchers) if (watcher.soon) return true;
  return false;
}

function wantsFacebook() {
  for (const watcher of watchers) if (watcher.facebook) return true;
  return false;
}

/** Where the check is pointed right now — a new address is answered at once. */
function targetSignature() {
  return `${liveTarget()?.url || ""}|${wantsFacebook() ? facebookTarget() : ""}`;
}

function delay() {
  return wantsSoon() ? SOON_MS : IDLE_MS;
}

function schedule(ms: number) {
  window.clearTimeout(timer);
  timer = window.setTimeout(run, ms);
}

async function run() {
  if (!watchers.size) return;
  /* A broadcast that is on air is the one moment the answer matters, so it is
     never skipped; a hidden tab is otherwise left alone (no point in spending
     the proxy's time on a screen nobody is looking at). */
  const hidden = document.visibilityState === "hidden";
  if (hidden && snapshot.status.state !== "live") {
    schedule(30_000);
    return;
  }
  const facebook = wantsFacebook();
  publish({ checking: true });
  const next = await checkLiveStream({ facebook });
  if (!watchers.size) return;
  publish({ checking: false });
  lastTarget = targetSignature();
  /* Keep the last good answer when the check itself failed, so a hiccup never
     turns a live stream into an ended one. */
  if (next.state === "unknown" && snapshot.status.state === "live") {
    lastCheckAt = Date.now();
    schedule(delay());
    return;
  }
  saveLiveStatus(next);
  publish({ status: next });
  /* The answer's own verdict decides the cadence this time (a broadcast that
     has just been found must not wait out the quiet-week timer because the
     render has not landed yet). */
  lastCheckAt = next.checkedAt;
  schedule(delay());
}

function onWake() {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastCheckAt < 15_000) return;
  schedule(0);
}

function startPolling() {
  if (polling) return;
  polling = true;
  lastTarget = targetSignature();
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("online", onWake);
  /* Wait for the first answer within the freshness window (a cached answer
     paints at once and is re-checked behind it), but not long for an answer
     that has never been made or is already stale. */
  const sinceCheck = Date.now() - (lastCheckAt || 0);
  schedule(sinceCheck < FRESH_MS ? FRESH_MS - sinceCheck : 800);
}

function stopPolling() {
  polling = false;
  window.clearTimeout(timer);
  document.removeEventListener("visibilitychange", onWake);
  window.removeEventListener("online", onWake);
  publish({ checking: false });
}

/**
 * Read the live answer while a component is on screen. `soon` is the caller's
 * hint that a broadcast is expected (a service is on the clock) — the only time
 * the check runs on the short cadence; `facebook` is the office's drawer asking
 * as well as YouTube (the one place that probe is worth its fetch). Returns the
 * unsubscribe, so it is used as an effect body.
 */
export function watchLiveStream(opts: { soon?: boolean; facebook?: boolean } = {}) {
  const watcher: Watcher = { soon: !!opts.soon, facebook: !!opts.facebook };
  const first = watchers.size === 0;
  watchers.add(watcher);
  if (first) startPolling();
  /* A caller who needs more than the poller is doing (Facebook, or the short
     cadence once a service comes on the clock) has this second asked rather
     than waiting out the quiet-week timer. */
  else if (watcher.facebook || (watcher.soon && Date.now() - lastCheckAt > SOON_MS)) schedule(600);
  return () => {
    watchers.delete(watcher);
    if (!watchers.size) stopPolling();
  };
}

/* --------------------------------------------------------------- the hook */

/**
 * The live status, kept fresh while the component is on screen. Every caller
 * shares one poll (see *the shared answer* above), so the hook is safe to mount
 * wherever a live state is shown.
 */
export function useLiveStream(soon = false, watchFacebook = false) {
  const { status, checking } = useLiveStatus();
  useEffect(() => watchLiveStream({ soon, facebook: watchFacebook }), [soon, watchFacebook]);
  return { ...status, checking } as LiveStatus & { checking: boolean };
}
