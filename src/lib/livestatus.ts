/* On-air check: reads the channel's /live page for `isLiveNow` (never `isLiveContent`/`isLive`,
   both traps, note 112) via the office-server proxy (no CORS). A bot-walled /live page can name the
   broadcast without playing it (note 322) — the check then follows the Live tab's video to its watch
   page, whose on-air chrome (`Live` indicator + `watching now`, measured on a real service) is the
   answer — before calling anything off. Named videos are only suggestions
   (note 324): each is verified on its own watch page, since the first id on a
   channel page may be an ad or a related upload. Cached, re-checked on a timer; failures read
   "unknown". Ended broadcasts are remembered for auto-stop; Facebook only ever confirms. */

import { useEffect, useState, useSyncExternalStore } from "react";
import { LIVE } from "../data/live";
import { parseYoutubeId, cleanChannelInput } from "./embed";
import { BUILD_NOTES, readStore, writeStore } from "./hooks";
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
  /** The broadcast channel's own id, when the channel page is on air but no
      video id could be verified (note 330): the player follows the channel. */
  channelId: string;
  /** The address this answer was checked for (note 349): the channel space
      it belongs to. An answer stamped for another address never plays, never
      reports, and never seeds the ended screen — the livestream shows only
      the handle in the YouTube channel space. Caches from older updates
      carry no stamp and pass through like before. */
  target: string;
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

const EMPTY: LiveStatus = { state: "unset", platform: "", videoId: "", title: "", channelId: "", target: "", checkedAt: 0, endedAt: 0 };

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
  /* No bare first-`videoId` fallback (note 324): a channel page is a grab-bag
     of ads, autoplay and related videos, so the first id in it is whoever
     YouTube put first this fetch — it once steered the player to an unrelated
     upload mid-service. An unnamed page stays unnamed; channel pages name
     their candidates through `channelCandidateIds` instead. */
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
    videoId: fromUrl?.[1] || canonical?.[1] || details?.[1] || "",
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

/** Candidate videos named by a channel page, best first (note 324): the Live
    tab's video when there is one, then every linked video by how often the
    page names it. This only ORDERS the asking — each candidate is verified on
    its own watch page by `resolveYoutube`, because the page that names them
    is a grab-bag and the first id in it must never be taken as the
    broadcast. */
export function channelCandidateIds(html: string, limit = 3): string[] {
  const text = String(html || "");
  const ids: string[] = [];
  const push = (id: string) => {
    if (id && ids.indexOf(id) < 0 && ids.length < limit) ids.push(id);
  };
  push(channelLiveVideoId(text));
  const freq = new Map<string, number>();
  for (const w of text.matchAll(/\/watch\?v=([\w-]{11})/g)) freq.set(w[1], (freq.get(w[1]) || 0) + 1);
  for (const [id] of [...freq.entries()].sort((a, b) => b[1] - a[1])) push(id);
  return ids;
}

/** The channel page's own id (note 330): the id the page names most — the
    owner dwarfs every guest — but only with a clear margin. A target that
    already carries the id wins without any counting; a contested or quiet
    page names nothing rather than risking the wrong channel's stream. */
export function extractChannelId(html: string, targetUrl = ""): string {
  const fromTarget = /(UC[\w-]{20,24})/.exec(String(targetUrl || ""));
  if (fromTarget) return fromTarget[1];
  const freq = new Map<string, number>();
  for (const w of String(html || "").matchAll(/"browseId":"(UC[\w-]{20,24})"/g)) freq.set(w[1], (freq.get(w[1]) || 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return "";
  const runner = ranked.length > 1 ? ranked[1][1] : 0;
  /* Strict margin, measured on a real walled service (owner named 17 times,
     strongest guest 4): below it the page stays unnamed and the answer below
     stays unknown. */
  if (ranked[0][1] < 5 || ranked[0][1] < 2 * runner) return "";
  return ranked[0][0];
}

/** The owner channel named by a watch page's own player model (note 349):
    every video belongs to exactly one channel, so a live candidate from
    another channel is an ad, an autoplay or a related upload — never the
    handle's broadcast. "" when the page names none (bot-walled reads). */
export function watchChannelId(watchHtml: string): string {
  const d = /"videoDetails":\{[^}]*?"channelId":"(UC[\w-]{20,24})"/.exec(String(watchHtml || ""));
  return d?.[1] || "";
}

/** True while a candidate may stand for the handle's broadcast (note 349),
    pure for the verifier: when the channel page's owner and the candidate's
    own page both name a channel and they differ, the candidate is somebody
    else's video and the asking moves on. Anything unprovable either way
    still plays — a thin read must never end a service. */
export function ownerAllowsCandidate(ownerChannelId: string, candidateChannelId: string): boolean {
  if (ownerChannelId && candidateChannelId && ownerChannelId !== candidateChannelId) return false;
  return true;
}

/** The designated channel's own id, answered with no page read (note 357):
    @twocorg is UCQ0KIUXUV7gTZmDDlvd3ZcQ (SPEC note 112 — the same answer the
    bake uses), so the livestream gate knows whose video counts even through
    the wall. Any other address names nothing, and every gate below behaves
    exactly like before for it. */
export const DESIGNATED_CHANNEL_IDS: Record<string, string> = {
  "@twocorg": "UCQ0KIUXUV7gTZmDDlvd3ZcQ",
};
/** The designated id for a channel input (note 357): cleaned first, so
    "@TWOCORG" and "@@twocorg" answer like "@twocorg". */
export function designatedChannelId(channelInput?: string): string {
  const cleaned = cleanChannelInput(channelInput === undefined ? LIVE.youtubeChannel : channelInput);
  if (!cleaned) return "";
  return DESIGNATED_CHANNEL_IDS[cleaned.toLowerCase()] || "";
}
/** The designated id for a checked target URL (note 357): a UC id in the
    address is the designation itself; an @handle answers from the baked map
    above; anything else names nothing. */
export function designatedChannelIdForTarget(targetUrl: string): string {
  const url = String(targetUrl || "");
  const id = /(UC[\w-]{20,24})/.exec(url);
  if (id) return id[1];
  const at = /youtube\.com\/@([\w.-]+)/i.exec(url);
  if (at) return DESIGNATED_CHANNEL_IDS[("@" + at[1]).toLowerCase()] || "";
  return "";
}
/** True while this channel may stand for the designated broadcast (note 357),
    pure for the verifier: a named channel that is not the designated one is
    somebody else's video and never plays; an unnamed one passes through (the
    candidate and report gates below judge those — a thin read must still be
    able to end silence). */
export function isDesignatedChannel(channelId: string, designatedId: string): boolean {
  const c = String(channelId || "");
  const d = String(designatedId || "");
  if (!d || !c) return true;
  return c === d;
}
/** True while a suggestion may stand for the designated broadcast (note 357),
    pure for the verifier: the page that names the suggestions is a grab-bag,
    so a suggestion from another channel is skipped like an off answer — and
    with the designation known, an ownerless grab-bag mention plays only when
    the channel's own Live tab points at it. The Live tab names the channel's
    own video, so it vouches where a walled watch page cannot. */
export function candidateStandsForDesignated(
  candidateChannelId: string,
  designatedId: string,
  fromLiveTab = false
): boolean {
  const d = String(designatedId || "");
  if (!d) return true;
  const c = String(candidateChannelId || "");
  if (c) return c === d;
  return fromLiveTab === true;
}

/** True while this answer belongs to the address asked for (note 349), pure
    for the verifier: an answer stamped for another address (the office moved
    the channel since the check) never plays and never reports. Caches from
    older updates carry no stamp and pass through like before. */
export function isStatusForTarget(status: { target?: unknown }, targetUrl: string): boolean {
  const stamped = String((status && status.target) || "");
  if (!stamped) return true;
  return stamped === String(targetUrl || "");
}

/** What an "off" answer keeps from the broadcast before it (note 349), pure
    for the verifier: the ended screen keeps the video it was — but only when
    it was the SAME address. A moved channel drops the old video outright
    instead of seeding the new handle's ended screen, cover and recents with
    somebody else's service. */
export function inheritEnded(
  before: LiveStatus,
  targetUrl: string,
  checkedAt: number,
  designatedId = ""
): { endedAt: number; videoId: string; title: string; channelId: string; platform: LivePlatform | "" } {
  if ((before.state === "live" || before.endedAt > 0) && isStatusForTarget(before, targetUrl)) {
    /* A kept video from another channel is dropped too (note 357): the new
       handle never inherits somebody else's service on its ended screen.
       Older callers pass nothing and behave exactly like before. */
    const d = String(designatedId || "");
    const keptId = String(before.channelId || "");
    if (d && keptId && keptId !== d) return { endedAt: 0, videoId: "", title: "", channelId: "", platform: "" };
    return {
      endedAt: before.state === "live" ? checkedAt : before.endedAt,
      videoId: before.videoId,
      title: before.title,
      channelId: before.channelId,
      platform: before.platform,
    };
  }
  return { endedAt: 0, videoId: "", title: "", channelId: "", platform: "" };
}

/** The walled-but-on-air answer (note 330), pure for the verifier: a channel
    page carrying on-air chrome that no suggestion confirmed plays the channel
    when the page names its owner clearly — otherwise it stays `unknown`, never
    `off`, and never a guessed video. */
export function unverifiedChannelAnswer(
  live: boolean,
  title: string,
  channelId: string,
  designatedId = ""
): { state: LiveState; videoId: string; title: string; channelId: string } {
  /* Strict (note 357): a chrome-only page follows the channel only when the
     page names the designated owner — an unnamed or foreign owner stays
     unknown and the screen waits instead of playing a guess. Older callers
     pass nothing and behave exactly like before. */
  const d = String(designatedId || "");
  if (live && channelId && (!d || channelId === d)) return { state: "live", videoId: "", title, channelId };
  if (live) return { state: "unknown", videoId: "", title: "", channelId: "" };
  return { state: "off", videoId: "", title: "", channelId: "" };
}

/** Answer YouTube for a fetched channel/watch page (note 322): when the page
    is readable but carries no live marker and the target is a channel, the
    Live tab's video is asked on its own watch page before anything is called
    off — a page we merely could not read stays `unknown`, never `off`. */
async function resolveYoutube(
  target: { url: string; kind: "channel" | "video" },
  html: string
): Promise<{ state: LiveState; videoId: string; title: string; channelId: string }> {
  const off = { state: "off" as const, videoId: "", title: "", channelId: "" };
  const parsed = parseLivePage(html, target.url);
  /* A direct hit already names its video (player marker, canonical link, or
     the asked watch address) — nothing more to ask. */
  if (parsed.live && parsed.videoId) return { state: "live" as const, videoId: parsed.videoId, title: parsed.title, channelId: "" };
  if (!parsed.read) return { state: "unknown" as const, videoId: "", title: "", channelId: "" };
  if (target.kind !== "channel") return off;
  /* Otherwise the page only SUGGESTS videos (note 324) — the Live tab's, then
     the most named — and each suggestion is asked on its own watch page. The
     first one that is on air is the broadcast; videos that answer `off` are
     skipped, not trusted, because the page that named them may be the
     grab-bag. Only when every named video is accounted for does the answer
     settle — and a channel page that itself carries on-air chrome no candidate
     confirmed stays `unknown`, never `off`, rather than ending a service. */
  const cands = channelCandidateIds(html);
  /* Only the handle's own videos (note 349): the page that names the
     suggestions is a grab-bag, so a live suggestion from another channel is
     skipped like an off answer — the asking moves on, never the player. */
  const owner = extractChannelId(html, target.url);
  /* Only the designated channel's videos (note 357): with the designation
     known, an ownerless grab-bag mention plays only when the channel's own
     Live tab points at it — the Live tab vouches where a walled watch page
     cannot. */
  const designatedId = designatedChannelIdForTarget(target.url);
  const liveTabId = channelLiveVideoId(html);
  for (const vid of cands) {
    const watchUrl = `https://www.youtube.com/watch?v=${vid}`;
    const watchHtml = await fetchPage(watchUrl);
    if (watchHtml === null) continue;
    const watch = parseLivePage(watchHtml, watchUrl);
    if (watch.live && (watch.videoId || vid)) {
      if (!ownerAllowsCandidate(owner, watchChannelId(watchHtml))) continue;
      if (!candidateStandsForDesignated(watchChannelId(watchHtml), designatedId, vid === liveTabId)) continue;
      return { state: "live" as const, videoId: watch.videoId || vid, title: watch.title, channelId: "" };
    }
  }
  /* Walled but on air (note 330): the channel page carries the full on-air
     chrome yet no suggestion verifies — measured on a real service, every
     watch page answers 502 through the deployed server while the channel page
     reads 200, and the public proxy is down too. Guessing a video would
     repeat note 324, so the answer follows the channel instead, through
     `unverifiedChannelAnswer` above — and a page we merely could not read
     stays `unknown`, never `off`. */
  return unverifiedChannelAnswer(parsed.live, parsed.title, parsed.live ? extractChannelId(html, target.url) : "", designatedId);
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
    where it saw it, and when — trusted only while fresh and on this target.
    `notes` is the reporter's own update (note 332): a mixed-version office tab
    (an old bundle still open somewhere) must never steer this one, so a report
    from any other update is ignored and the scrape below runs instead. */
export type LiveReport = { target: string; state: "live" | "off"; videoId: string; title: string; channelId: string; checkedAt: number; notes: number };
/* A report older than this is ignored (the office tab closed or sleeps) and
   the check falls back to reading YouTube itself. */
const REPORT_FRESH_MS = 150_000;
/* Reports ride the same door as content — tiny and fast; a slow door must
   never hold up the scrape behind it. */
const REPORT_TIMEOUT_MS = 6_000;

/** Same-update reporters only (note 332), pure for the verifier: an old bundle
    still open in some office tab reports the old code's answers (once a wrong
    video id mid-service) — those must never steer this update. */
export function reportMatchesBuild(rep: { notes?: unknown }): boolean {
  return Number(rep?.notes) === BUILD_NOTES;
}
/** True while an office report names something the player may open (note 357),
    pure for the verifier: a "live" report with no video id is an unverified
    channel follow — it must never open the player by itself. Readers fall
    through to their own scrape (usually `unknown` → the waiting screen)
    instead of playing a guess. "off" reports carry no video by design and
    pass through. */
export function reportCarriesVideo(rep: { state?: unknown; videoId?: unknown }): boolean {
  if (String((rep && rep.state) || "") !== "live") return true;
  return !!String((rep && rep.videoId) || "");
}

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
    if (!reportMatchesBuild(r)) return null;
    const checkedAt = Number(r.checkedAt) || 0;
    if (!(checkedAt > 0) || Date.now() - checkedAt > REPORT_FRESH_MS) return null;
    const cid = String(r.channelId || "");
    return { target: String(r.target || ""), state: r.state, videoId: String(r.videoId || ""), title: String(r.title || ""), channelId: /^UC[\w-]{20,24}$/.test(cid) ? cid : "", checkedAt, notes: BUILD_NOTES };
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
  /* A videoless "live" report is an unverified follow (note 357): it never
     opens the player — the scrape below runs and usually waits. */
  const officeHit = target && officeRep && officeRep.target === target.url && reportCarriesVideo(officeRep) ? officeRep : null;
  const html = target && !officeHit ? await fetchPage(target.url) : null;
  const youtube: { state: LiveState; videoId: string; title: string; channelId: string } = !target
    ? { state: "unset", videoId: "", title: "", channelId: "" }
    : officeHit
    ? officeHit.state === "live"
      ? { state: "live", videoId: officeHit.videoId, title: officeHit.title, channelId: officeHit.channelId }
      : { state: "off", videoId: "", title: "", channelId: "" }
    : html === null
    ? { state: "unknown", videoId: "", title: "", channelId: "" }
    : await resolveYoutube(target, html);

  /* Facebook is asked only when YouTube has not already answered "live" — it is
     the office's drawer that asks, and this is the one case it can add
     something: a service that is only on Facebook (SPEC note 111). */
  let facebook: { state: LiveState; videoId: string; title: string; channelId: string } = { state: "unset", videoId: "", title: "", channelId: "" };
  if (fbUrl && youtube.state !== "live") {
    const fbHtml = await fetchPage(fbUrl);
    if (fbHtml !== null) {
      const parsed = parseFacebookLivePage(fbHtml);
      facebook = { state: parsed.live ? "live" : "unknown", videoId: parsed.videoId, title: parsed.title, channelId: "" };
    }
  }

  const found =
    youtube.state === "live"
      ? { platform: "youtube" as LivePlatform, videoId: youtube.videoId, title: youtube.title, channelId: youtube.channelId }
      : facebook.state === "live"
      ? { platform: "facebook" as LivePlatform, videoId: facebook.videoId, title: facebook.title, channelId: "" }
      : null;

  const state: LiveState = found
    ? "live"
    : youtube.state === "off" || facebook.state === "off"
    ? "off"
    : youtube.state === "unset" && facebook.state === "unset"
    ? "unset"
    : "unknown";

  const checkedAt = Date.now();
  const targetUrl = target?.url || "";
  const next: LiveStatus = { state, platform: found?.platform || "", videoId: found?.videoId || "", title: found?.title || "", channelId: found?.channelId || "", target: targetUrl, checkedAt, endedAt: 0 };

  /* A watched broadcast's ending sticks until one comes back (autostop) — but
     only for the address it was (note 349): a moved channel drops the old
     video outright instead of seeding the new handle's ended screen. */
  const before = readLiveStatus();
  if (state === "off" && (before.state === "live" || before.endedAt > 0)) {
    /* The moment it ended is the first answer that says it has; every answer
       after that carries the same moment and the video it was. */
    const kept = inheritEnded(before, targetUrl, checkedAt, designatedChannelIdForTarget(targetUrl));
    next.endedAt = kept.endedAt;
    next.videoId = kept.videoId;
    next.title = kept.title;
    next.channelId = kept.channelId;
    next.platform = kept.platform;
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
    channelId: String(cached.channelId || ""),
    target: String((cached as Partial<LiveStatus>).target || ""),
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
    /* Only a verified broadcast id is reported (note 357): an unverified
       channel-live answer names no video, so reporting it would steer every
       visitor's player at a guess — it stays local, and the readers wait. */
    if (status.state === "live" && !status.videoId) return;
    const url = liveTarget()?.url || "";
    if (!url) return;
    /* An answer checked for another address (the channel moved since) never
       reports (note 349): the office must not steer visitors to the old
       handle's video. */
    if (!isStatusForTarget(status, url)) return;
    reportSink({ target: url, state: status.state, videoId: status.videoId, title: status.title, channelId: status.channelId, checkedAt: status.checkedAt, notes: BUILD_NOTES });
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
    a.channelId === b.channelId &&
    a.target === b.target &&
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

/* ------------------------------- playable check (note 332): never embed a
   dead video. A stale office report (or a removed upload) can name a video id
   that YouTube no longer plays — autoplaying it fills the screen with the
   black "unavailable" frame. So ids are asked of YouTube's oEmbed endpoint
   before they play: 200 means it plays, 4xx means it is gone (removed,
   private, bad id), anything else — or a network failure — means unknown and
   plays anyway, with the player's own fallback as the net. Direct browser
   fetch (no proxy door needed); cached 5 minutes; in-flight asks shared. */

const VERIFY_TTL_MS = 5 * 60_000;
const VERIFY_TIMEOUT_MS = 8_000;
const verifyCache = new Map<string, { ok: boolean; at: number }>();
const verifyInflight = new Map<string, Promise<boolean | null>>();

/** Pure for the verifier: an oEmbed answer in, playable or not. */
export function oembedPlayable(status: number): boolean | null {
  if (status === 200) return true;
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 410) return false;
  return null;
}

function oembedUrl(id: string): string {
  return `https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}&format=json`;
}

/** Cache-only peek (no fetch): true = played before, false = known dead, null = never asked. */
export function peekVerified(videoId: string): boolean | null {
  const id = parseYoutubeId(videoId);
  if (!id) return false;
  const hit = verifyCache.get(id);
  if (!hit || Date.now() - hit.at >= VERIFY_TTL_MS) return null;
  return hit.ok;
}

/** Is this video playable right now? true = plays, false = gone, null = could
    not tell (offline, proxy/probe down — play anyway). Never throws. */
export async function verifyYoutubeId(videoId: string): Promise<boolean | null> {
  const id = parseYoutubeId(videoId);
  if (!id) return false;
  const peek = peekVerified(id);
  if (peek !== null) return peek;
  const running = verifyInflight.get(id);
  if (running) return running;
  const job = (async (): Promise<boolean | null> => {
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? window.setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT_MS) : 0;
      try {
        const res = await fetch(oembedUrl(id), { cache: "no-store" });
        const verdict = oembedPlayable(res.status);
        if (verdict !== null) verifyCache.set(id, { ok: verdict, at: Date.now() });
        return verdict;
      } finally {
        if (timer) window.clearTimeout(timer);
      }
    } catch {
      return null;
    } finally {
      verifyInflight.delete(id);
    }
  })();
  verifyInflight.set(id, job);
  return job;
}

/** Tri-state availability for render: true = plays, false = dead, null =
    checking or unknown (play anyway — the player is the net). */
export function useYoutubeVerdict(videoId: string): boolean | null {
  const id = parseYoutubeId(videoId);
  const [verdict, setVerdict] = useState<boolean | null>(() => peekVerified(id));
  useEffect(() => {
    if (!id) {
      setVerdict(false);
      return;
    }
    const peek = peekVerified(id);
    setVerdict(peek);
    if (peek !== null) return;
    let alive = true;
    verifyYoutubeId(id)
      .then((v) => {
        if (alive) setVerdict(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  return verdict;
}
