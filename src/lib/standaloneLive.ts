/* Standalone livestream engine — ported from watch-live-standalone (watch-live.html).
   This is now the site's ONLY livestream code. The old office-proxy/bot-wall
   check (livestatus.ts, 69k lines of scrape + report + guest-slot logic) was
   removed and replaced with this: verify the id (noembed -> oEmbed), autoplay
   muted, cover lifts only on PLAYING, dead ids land on thumbnail + repair.
   The /live-page scrape is a best-effort hint only — the explicit youtubeId
   is the reliable switch. No platform code, no plugins, no build step needed
   for this file's logic. */

import { parseYoutubeId as parseId, cleanChannelInput } from "./embed";

export { parseYoutubeId } from "./embed";

/** The church channel to ask, cleaned; falls back to @twocorg.
    The caller passes LIVE.youtubeChannel — this helper stays pure. */
export function channelOf(channelInput?: string): string {
  const raw = String(channelInput || "").trim();
  return raw || "@twocorg";
}

/** The explicit video id the office set (a bare id or any YouTube link).
    The caller passes LIVE.youtubeId — this helper stays pure. */
export function configuredId(youtubeId?: string): string {
  return parseId(String(youtubeId || ""));
}

/** Thumbnail for a video id ("" when none). */
export function thumbFor(id: string): string {
  const v = parseId(id);
  return v ? `https://i.ytimg.com/vi/${v}/hqdefault.jpg` : "";
}

/* ------------------------------- verification ------------------------------- */

const VERIFY_TTL = 5 * 60 * 1000;
const DEAD_TTL = 60 * 1000;
const VERIFY_TIMEOUT = 6000;

type VerifyHit = { ok: boolean; at: number };
const verifyCache = new Map<string, VerifyHit>();
const verifyInflight = new Map<string, Promise<boolean | null>>();

/** Cached verdict: true = plays, false = dead, null = unknown/stale. */
export function peekVerified(id: string): boolean | null {
  const clean = parseId(id);
  if (!clean) return false;
  const hit = verifyCache.get(clean);
  if (!hit) return null;
  const age = Date.now() - hit.at;
  if (hit.ok) return age >= VERIFY_TTL ? null : true;
  return age >= DEAD_TTL ? null : false;
}

export function forgetVerified(id: string): void {
  try {
    const clean = parseId(id);
    verifyCache.delete(clean);
    verifyInflight.delete(clean);
  } catch { /* never throws */ }
}

export function forgetAllVerified(): void {
  try {
    verifyCache.clear();
  } catch { /* never throws */ }
  try {
    verifyInflight.clear();
  } catch { /* never throws */ }
}

/** oEmbed status -> playable verdict (pure, exported for tests). */
export function oembedPlayable(status: number): boolean | null {
  if (status === 200) return true;
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 410) return false;
  return null;
}

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? window.setTimeout(() => { try { ctrl.abort(); } catch { /* noop */ } }, ms) : 0;
  return fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined }).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

/** Ask YouTube whether an id plays: noembed first (CORS-open), oEmbed behind it.
    200/html = plays, error/4xx = dead, anything else = unknown (plays anyway).
    Cached 5 min, dead 60 s, in-flight asks shared. Never throws. */
export function verifyYoutubeId(rawId: string): Promise<boolean | null> {
  const id = parseId(rawId);
  if (!id) return Promise.resolve(false);
  const peeked = peekVerified(id);
  if (peeked !== null) return Promise.resolve(peeked);
  const running = verifyInflight.get(id);
  if (running) return running;
  const job = (async (): Promise<boolean | null> => {
    function done(v: boolean | null, cacheIt: boolean): boolean | null {
      if (cacheIt && v !== null) verifyCache.set(id, { ok: v, at: Date.now() });
      return v;
    }
    try {
      const res = await fetchWithTimeout(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, VERIFY_TIMEOUT);
      if (res && res.ok) {
        const d = await res.json().catch(() => null) as { html?: string; error?: string } | null;
        if (d && typeof d.html === "string" && d.html.length) return done(true, true);
        if (d && d.error) return done(false, true);
      }
    } catch { /* fall through to oEmbed */ }
    try {
      const res = await fetchWithTimeout(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, VERIFY_TIMEOUT);
      return done(oembedPlayable(res.status), true);
    } catch {
      return done(null, false);
    }
  })().finally(() => {
    try { verifyInflight.delete(id); } catch { /* noop */ }
  });
  verifyInflight.set(id, job);
  return job;
}

/* ------------------------------- /live scrape ------------------------------- */

export type LivePageRead = { hasYt: boolean; live: boolean; videoId: string; len: number };

/** Read a /live page's HTML the way the standalone does: yt markers + isLiveNow. */
export function readLivePage(html: string): LivePageRead {
  const t = String(html || "");
  const hasYt = /ytInitialData/.test(t) || /"videoDetails":\{/.test(t) || /ytInitialPlayerResponse/.test(t);
  const live =
    hasYt &&
    (/"isLiveNow":true/.test(t) ||
      /"hlsManifestUrl":"https?:\/\//.test(t) ||
      (/"liveIndicatorText":\{"simpleText":"Live"\}/.test(t) && / watching now"/.test(t)));
  let vid = "";
  if (live) {
    const m =
      /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(t) ||
      /"videoDetails":\{[^}]*?"videoId":"([\w-]{11})"/.exec(t) ||
      /(?:watch\?v=|\/live\/|\/embed\/|\/v\/|youtu\.be\/)([\w-]{11})/.exec(t);
    if (m) {
      const cand = m[m.length - 1] || m[1] || "";
      vid = parseId(cand);
    }
  }
  return { hasYt, live, videoId: vid, len: t.length };
}

/** The /live URL for a channel input (handle, id or link). */
export function livePageUrl(channelInput: string): string {
  const raw = cleanChannelInput(channelInput);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "") + "/live";
  const id = /(UC[\w-]{20,24})/.exec(raw);
  if (id) return `https://www.youtube.com/channel/${id[1]}/live`;
  const at = /youtube\.com\/@([\w.-]+)/i.exec(raw) || /^@([\w.-]+)$/.exec(raw);
  if (at) return `https://www.youtube.com/@${at[1]}/live`;
  const legacy = /youtube\.com\/(?:c|user)\/([\w.-]+)/i.exec(raw);
  if (legacy) return `https://www.youtube.com/${/\/user\//i.test(raw) ? "user" : "c"}/${legacy[1]}/live`;
  if (/^[\w.-]+$/.test(raw)) return `https://www.youtube.com/@${raw}/live`;
  return "";
}

export type LiveCheck =
  | { kind: "live"; videoId: string; door: string }
  | { kind: "off" }
  | { kind: "unknown" };

function browserDoor(url: string): Promise<{ door: string; html?: string; error?: string }> {
  return fetch(url, { cache: "no-store" })
    .then((r) => {
      if (!r || !r.ok) throw new Error("http " + (r && r.status));
      return r.text().then((html) => ({ door: url, html }));
    })
    .catch((e) => ({ door: url, error: String((e && e.message) || e).slice(0, 100) }));
}

/** Ask the channel's /live page (direct + public proxies). Never throws.
    A clean YouTube read with no live marker = off; no YouTube read = unknown. */
export async function checkChannelLive(channelInput: string): Promise<LiveCheck> {
  const target = livePageUrl(channelInput);
  if (!target) return { kind: "unknown" };
  const jobs = [
    browserDoor(target),
    browserDoor(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`),
    browserDoor(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`),
  ];
  const results = await Promise.all(jobs);
  let gotLive: { videoId: string; door: string } | null = null;
  let gotCleanOff = false;
  let gotWalled = false;
  for (const r of results) {
    if (r.html) {
      const p = readLivePage(r.html);
      if (p.live && p.videoId) {
        gotLive = gotLive || { videoId: p.videoId, door: r.door };
      } else if (p.hasYt && !p.live) {
        gotCleanOff = true;
      } else {
        gotWalled = true;
      }
    }
  }
  if (gotLive) return { kind: "live", videoId: gotLive.videoId, door: gotLive.door };
  if (!results.some((r) => !!r.html)) return { kind: "unknown" };
  if (gotCleanOff && !gotWalled) return { kind: "off" };
  return { kind: "unknown" };
}

/* ------------------------------- YouTube IFrame API ------------------------------- */

let ytApiPromise: Promise<typeof YT | null> | null = null;

/** Load the YouTube IFrame API once (shared). Resolves null when blocked. */
export function loadYtApi(): Promise<typeof YT | null> {
  try {
    const w = window as unknown as { YT?: typeof YT; onYouTubeIframeAPIReady?: () => void };
    if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve) => {
      try {
        const prev = w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady = () => {
          try { if (typeof prev === "function") prev(); } catch { /* noop */ }
          resolve(w.YT || null);
        };
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        tag.async = true;
        document.head.appendChild(tag);
        window.setTimeout(() => resolve(w.YT || null), 10_000);
      } catch {
        resolve(null);
      }
    });
    return ytApiPromise;
  } catch {
    return Promise.resolve(null);
  }
}
