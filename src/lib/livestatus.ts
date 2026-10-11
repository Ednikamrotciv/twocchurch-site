/* On-air check: reads the channel's /live page for `isLiveNow` (never `isLiveContent`/`isLive`,
   both traps, note 112) via the office-server proxy (no CORS). A bot-walled /live page can name the
   broadcast without playing it (note 322) — the check then follows the Live tab's video to its watch
   page, whose on-air chrome (`Live` indicator + `watching now`, measured on a real service) is the
   answer — before calling anything off. Cached, re-checked on a timer; failures read
   "unknown". Ended broadcasts are remembered for auto-stop; Facebook only ever confirms. */

import { useEffect, useSyncExternalStore } from "react";
import { LIVE } from "../data/live";
import { parseYoutubeId, cleanChannelInput } from "./embed";
import { readStore, writeStore } from "./hooks";
import { serverUrl } from "./remoteserver";

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
  /** When a seen-live broadcast stopped (ms); video kept for seeding Recent services. */
  endedAt: number;
};

export const LIVE_STATUS_KEY = "wom.livestatus";

/** A status younger than this is trusted on mount instead of re-checked —
    unless a watcher asks urgent (the Watch page does: it checks at once). */
const FRESH_MS = 45_000;
/** Give the proxy this long before calling the check a failure. */
const CHECK_TIMEOUT_MS = 15_000;
/** Poll cadence (note 310): fast while a broadcast is expected or the Watch
    page is open — a YouTube start shows in seconds and the waiting clock
    vanishes with it — slower in the quiet week. Live and local share this
    poller; only the fetch door differs (same-origin /__yt on local runs, the
    office server when joined, else the public proxy). */
export const SOON_MS = 20_000;
export const IDLE_MS = 90_000;

const EMPTY: LiveStatus = { state: "unset", platform: "", videoId: "", title: "", checkedAt: 0, endedAt: 0 };

/* --------------------------------------------------------------- the target */

/** Where to ask: the channel when set (its /live follows every broadcast), else the link. */
export function liveTarget(): { url: string; kind: "channel" | "video" } | null {
  /* Cleaned first (note 320): a doubled "@" used to return null here and the
     whole site silently watched nothing. */
  const raw = cleanChannelInput(LIVE.youtubeChannel);
  if (raw) {
    /* Handle, id or link — each becomes the channel's /live page. */
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

/** Where to ask Facebook (live video or page); empty when unset. */
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

/** Read a YouTube page; unreadable pages return "no answer", never "off". */
export function parseLivePage(html: string, pageUrl = ""): { read: boolean; live: boolean; videoId: string; title: string } {
  const text = String(html || "");
  /* YouTube's own pages all carry the inlined page model — a consent wall or an
     error page carries none of it. */
  const read = /ytInitialData/.test(text) || /"videoDetails":\{/.test(text);
  /* `isLiveNow` (or a live manifest) is the player saying it — but a bot-walled
     page can hide the player while still printing the broadcast's own chrome
     (note 322, measured on a real service: no `isLiveNow`, yet `watching now`,
     `Started streaming … ago`, the `Live` indicator and a live-chat
     continuation). Those only ever sit together while on air, so together they
     are a live marker; each alone is not — and `"isLive":true` still never is
     (note 112: finished pages keep it in the view-count renderer). */
  const chromeLive =
    (/"liveIndicatorText":\{"simpleText":"Live"\}/.test(text) && / watching now"/.test(text)) ||
    (/"dateText":\{"simpleText":"Started streaming /.test(text) && / watching now"/.test(text)) ||
    (/"liveChatRenderer":\{"continuations"/.test(text) && / watching now"/.test(text));
  const live = read && (/"isLiveNow":true/.test(text) || /"hlsManifestUrl":"https?:\/\//.test(text) || chromeLive);
  if (!live) return { read, live: false, videoId: "", title: "" };
  /* A bot-walled watch page drops the canonical link and the videoDetails id
     (note 322) — the address asked for is the id then. */
  const fromUrl = /(?:watch\?v=|\/live\/|\/embed\/|\/v\/|youtu\.be\/)([\w-]{11})/.exec(String(pageUrl || ""));
  const canonical = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(text);
  const details = /"videoDetails":\{[^}]*?"videoId":"([\w-]{11})"/.exec(text);
  const any = /"videoId":"([\w-]{11})"/.exec(text);
  const meta = /<meta name="title" content="([^"]*)"/.exec(text);
  const videoTitle = /"videoDetails":\{[^}]*?"title":"((?:[^"\\]|\\.)*)"/.exec(text);
  const overlayTitle = /"playerOverlayVideoDetailsRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.)*)"/.exec(text);
  const headline =
    meta?.[1] ||
    (videoTitle ? videoTitle[1].replace(/\\"/g, '"') : "") ||
    (overlayTitle ? overlayTitle[1].replace(/\\"/g, '"') : "");
  return {
    read,
    live: true,
    videoId: fromUrl?.[1] || canonical?.[1] || details?.[1] || any?.[1] || "",
    title: decodeEntities(headline),
  };
}

/** The video the channel's Live tab is showing (note 322): a channel's /live
    page carries no player marker on a bot-walled read, so the check follows
    this id to its watch page for the real answer. "" when the tab is empty. */
export function channelLiveVideoId(html: string): string {
  const text = String(html || "");
  const tab = text.indexOf('"title":"Live","selected":true');
  if (tab < 0) return "";
  const seg = text.slice(tab, tab + 30_000);
  return /"url":"\/watch\?v=([\w-]{11})"/.exec(seg)?.[1] || /"videoId":"([\w-]{11})"/.exec(seg)?.[1] || "";
}

/** Answer YouTube for a fetched channel/watch page (note 322): when the page
    is readable but carries no live marker and the target is a channel, the
    Live tab's video is asked on its own watch page before anything is called
    off — a page we merely could not read stays `unknown`, never `off`. */
async function resolveYoutube(
  target: { url: string; kind: "channel" | "video" },
  html: string
): Promise<{ state: LiveState; videoId: string; title: string }> {
  const off = { state: "off" as const, videoId: "", title: "" };
  const parsed = parseLivePage(html, target.url);
  if (parsed.live) return { state: "live" as const, videoId: parsed.videoId, title: parsed.title };
  if (!parsed.read) return { state: "unknown" as const, videoId: "", title: "" };
  if (target.kind === "channel") {
    const vid = channelLiveVideoId(html);
    if (!vid) return off;
    const watchUrl = `https://www.youtube.com/watch?v=${vid}`;
    const watchHtml = await fetchPage(watchUrl);
    if (watchHtml === null) return { state: "unknown" as const, videoId: "", title: "" };
    const watch = parseLivePage(watchHtml, watchUrl);
    if (watch.live) return { state: "live" as const, videoId: watch.videoId || vid, title: watch.title };
    if (!watch.read) return { state: "unknown" as const, videoId: "", title: "" };
  }
  return off;
}

/** Facebook can only confirm a broadcast (two markers); never trusts "off". */
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

/** Page HTML via a same-origin / office-server proxy, else public CORS proxy. */
async function fetchPage(url: string): Promise<string | null> {
  const local = await fetchPageLocal(url);
  if (local) return local;
  const office = await fetchPageOffice(url);
  if (office) return office;
  return fetchPageRemote(url);
}

/* Last resort for hosts with no proxy: a free public CORS proxy.
   Only reached when no office door is open, and a miss
   degrades exactly as before (unknown, quiet). */
async function fetchPageRemote(url: string): Promise<string | null> {
  try {
    const res = await withTimeout(
      fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { cache: "no-store" }),
      CHECK_TIMEOUT_MS
    );
    if (!res || !res.ok) return null;
    const text = await res.text();
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch {
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

/** Office-server YouTube read for deployed copies joined to it. Skipped when
    this copy stands alone (the public proxy below covers that). */
async function fetchPageOffice(url: string): Promise<string | null> {
  try {
    const base = serverUrl();
    if (!base) return null;
    const res = await withTimeout(
      fetch(`${base}/__yt?url=${encodeURIComponent(url)}`, { cache: "no-store" }),
      CHECK_TIMEOUT_MS
    );
    if (!res || !res.ok) return null;
    const text = await res.text();
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/** The office's reported on-air answer (note 318): what the office copy saw,
    where it saw it, and when — trusted only while fresh and on this target. */
export type LiveReport = { target: string; state: "live" | "off"; videoId: string; title: string; checkedAt: number };
/* A report older than this is ignored (the office tab closed or sleeps) and
   the check falls back to reading YouTube itself. */
const REPORT_FRESH_MS = 150_000;
/* Reports ride the same door as content — tiny and fast; a slow door must
   never hold up the scrape behind it. */
const REPORT_TIMEOUT_MS = 6_000;

/** The latest office report, or null — public read, never throws. */
async function fetchLiveReport(): Promise<LiveReport | null> {
  try {
    const base = serverUrl();
    const res = await withTimeout(
      fetch(`${base}/__cms/liveReport?conn=rpt-` + Math.random().toString(36).slice(2), {
        method: "POST",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: "",
        cache: "no-store",
      }),
      REPORT_TIMEOUT_MS
    );
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    const rep = data && (data as { report?: unknown }).report;
    if (!rep || typeof rep !== "object") return null;
    const r = rep as Partial<LiveReport>;
    if (r.state !== "live" && r.state !== "off") return null;
    const checkedAt = Number(r.checkedAt) || 0;
    if (!(checkedAt > 0) || Date.now() - checkedAt > REPORT_FRESH_MS) return null;
    return { target: String(r.target || ""), state: r.state, videoId: String(r.videoId || ""), title: String(r.title || ""), checkedAt };
  } catch {
    return null;
  }
}

/** Ask YouTube whether we are broadcasting, right now. */
export async function checkLiveStream(opts: { facebook?: boolean } = {}): Promise<LiveStatus> {
  const target = liveTarget();
  const fbUrl = opts.facebook ? facebookTarget() : "";
  if (!target && !fbUrl) return { ...EMPTY, state: "unset", checkedAt: Date.now() };

  /* A fresh office report wins over the scrape (note 318): the deployed
     server cannot read YouTube itself (bot wall — the page comes back with a
     login wall and no live marker), but the office copy can, so while the
     office is open and reporting, visitors take its answer. A stale report,
     or one for another address, changes nothing — the scrape below runs. */
  const officeRep = target ? await fetchLiveReport() : null;
  const officeHit = target && officeRep && officeRep.target === target.url ? officeRep : null;
  const html = target && !officeHit ? await fetchPage(target.url) : null;
  const youtube: { state: LiveState; videoId: string; title: string } = !target
    ? { state: "unset", videoId: "", title: "" }
    : officeHit
    ? officeHit.state === "live"
      ? { state: "live", videoId: officeHit.videoId, title: officeHit.title }
      : { state: "off", videoId: "", title: "" }
    : html === null
    ? { state: "unknown", videoId: "", title: "" }
    : await resolveYoutube(target, html);

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

  /* A watched broadcast's ending sticks until one comes back (autostop). */
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

/* One shared, reference-counted poll; every live state reads it via `onAir()`. */

export type LiveSnapshot = { status: LiveStatus; checking: boolean };

/** What each mounted reader of the check is asking for. */
type Watcher = { soon: boolean; facebook: boolean; urgent: boolean };

let snapshot: LiveSnapshot = { status: readLiveStatus(), checking: false };
const watchers = new Set<Watcher>();
const listeners = new Set<() => void>();
let timer = 0;
let polling = false;
/** When the last answer was fetched (ms) — the freshness clock. */
let lastCheckAt = snapshot.status.checkedAt;
/** The address the last answer was about, so a new one is checked at once. */
let lastTarget = "";

/* Where definitive answers go when this copy is the office (note 318): the
   content store registers its authed-socket sink at boot; every other copy
   leaves it unset and only reads. Reporting never blocks or breaks the poll. */
let reportSink: ((rep: LiveReport) => void) | null = null;
export function setLiveReportSink(fn: ((rep: LiveReport) => void) | null) {
  reportSink = fn;
}

function maybeReport(status: LiveStatus) {
  try {
    if (!reportSink) return;
    /* Definitive YouTube answers only: unknowns, unsets and Facebook-only
       finds must never overwrite the office's real answer on the server. */
    if (status.state !== "live" && status.state !== "off") return;
    if (status.state === "live" && status.platform !== "youtube") return;
    const url = liveTarget()?.url || "";
    if (!url) return;
    reportSink({ target: url, state: status.state, videoId: status.videoId, title: status.title, checkedAt: status.checkedAt });
  } catch {
    /* reporting must never break the poll */
  }
}

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

/** The watched broadcast's ending (0 when none): the stream's way to stop the site. */
export function liveEndedAt(): number {
  return Number(snapshot.status.endedAt) || 0;
}

/** The answer, kept fresh for as long as the component is on screen. */
export function useLiveStatus(): LiveSnapshot {
  return useSyncExternalStore(subscribe, readSnapshot, readSnapshot);
}

/* --------------------------------------------------------------- the poller */

/** The short cadence while any caller expects a service, sits on the Watch
    page, or one is running. */
function wantsSoon() {
  if (snapshot.status.state === "live") return true;
  for (const watcher of watchers) if (watcher.soon) return true;
  return false;
}

function wantsFacebook() {
  for (const watcher of watchers) if (watcher.facebook) return true;
  return false;
}

function wantsUrgent() {
  for (const watcher of watchers) if (watcher.urgent) return true;
  return false;
}

/** Where the check is pointed right now — a new address is answered at once.
    The channel is editable in the console, so this moves whenever the office
    retypes it (note 310). */
function targetSignature() {
  return `${liveTarget()?.url || ""}|${wantsFacebook() ? facebookTarget() : ""}`;
}

/** The same signature for components: they re-ask when it moves. */
export function liveTargetSignature(): string {
  try {
    return targetSignature();
  } catch {
    return "";
  }
}

function delay() {
  return wantsSoon() ? SOON_MS : IDLE_MS;
}

function schedule(ms: number) {
  /* A moved target jumps the queue: the office retyped the channel (or a
     publish landed), so the old timer's wait no longer applies. */
  try {
    if (polling && targetSignature() !== lastTarget) ms = 0;
  } catch {
    /* the check below degrades exactly as before */
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(run, Math.max(0, ms));
}

/** Ask at once (the Watch page just opened, the office pressed Start/Stop,
    the channel was retyped). Collapses concurrent asks into one run. */
export function recheckLiveNow() {
  if (!polling || !watchers.size) return;
  schedule(0);
}

/* The content store applies the live section (draft preview while typing,
   published words on sync) through `bind`, which mutates LIVE in place with
   no event of its own — so it announces the move here (see `applySnapshot`
   in src/lib/cms.ts) and this debounces it into one immediate re-check. */
let targetNoteTimer = 0;
export function noteLiveTargetMayHaveChanged() {
  if (!polling || !watchers.size) return;
  if (targetNoteTimer) return;
  targetNoteTimer = window.setTimeout(() => {
    targetNoteTimer = 0;
    try {
      if (targetSignature() !== lastTarget) schedule(0);
    } catch {
      /* keep the standing timer */
    }
  }, 800);
}

function onLiveTargetEvent() {
  noteLiveTargetMayHaveChanged();
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
  /* This copy may be the office: a definitive answer goes to the server at
     once (note 318), so deployed visitors — whose own read of YouTube is bot-
     walled — see it on their next check. */
  maybeReport(next);
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
  window.addEventListener("wom:live-target", onLiveTargetEvent);
  /* An urgent watcher (the Watch page) checks at once — a YouTube start
     shows in seconds and the clock vanishes with it — instead of waiting out
     the freshness window. Everyone else waits for a fresh cached answer and
     re-checks behind it, or checks at once when the answer is stale. */
  if (wantsUrgent()) {
    schedule(600);
    return;
  }
  /* Wait for the first answer within the freshness window (a cached answer
     paints at once and is re-checked behind it), but not long for an answer
     that has never been made or is already stale. */
  const sinceCheck = Date.now() - (lastCheckAt || 0);
  schedule(sinceCheck < FRESH_MS ? FRESH_MS - sinceCheck : 800);
}

function stopPolling() {
  polling = false;
  window.clearTimeout(timer);
  window.clearTimeout(targetNoteTimer);
  targetNoteTimer = 0;
  document.removeEventListener("visibilitychange", onWake);
  window.removeEventListener("online", onWake);
  window.removeEventListener("wom:live-target", onLiveTargetEvent);
  publish({ checking: false });
}

/** Live answer while mounted; short cadence when a broadcast is expected.
    `urgent` checks at once (the Watch page); a moved channel always does. */
export function watchLiveStream(opts: { soon?: boolean; facebook?: boolean; urgent?: boolean } = {}) {
  const watcher: Watcher = { soon: !!opts.soon, facebook: !!opts.facebook, urgent: !!opts.urgent };
  const first = watchers.size === 0;
  watchers.add(watcher);
  if (first) startPolling();
  /* A caller who needs more than the poller is doing (Facebook, the short
     cadence once a service comes on the clock, or the at-once check on the
     Watch page) has this second asked rather than waiting out the timer —
     and a retyped channel (or a landed publish) jumps the queue. */
  else if (watcher.urgent || watcher.facebook || targetSignature() !== lastTarget) schedule(600);
  else if (watcher.soon && Date.now() - lastCheckAt > SOON_MS) schedule(600);
  return () => {
    watchers.delete(watcher);
    if (!watchers.size) stopPolling();
  };
}

/* --------------------------------------------------------------- the hook */

/** Live status, shared by every caller through the one poll. `urgent` checks
    at once (the Watch page, so a YouTube start shows in seconds); a retyped
    channel re-checks by itself through the target signature. */
export function useLiveStream(soon = false, watchFacebook = false, urgent = false) {
  const { status, checking } = useLiveStatus();
  useEffect(() => watchLiveStream({ soon, facebook: watchFacebook, urgent }), [soon, watchFacebook, urgent]);
  /* The channel is editable: the office retyping it (or a publish landing)
     moves the target, and the check follows at once instead of waiting out
     the timer. Same on live and local — only the fetch door differs. */
  const signature = liveTargetSignature();
  useEffect(() => {
    noteLiveTargetMayHaveChanged();
  }, [signature]);
  return { ...status, checking } as LiveStatus & { checking: boolean };
}
