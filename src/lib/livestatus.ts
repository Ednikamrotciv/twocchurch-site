/* On-air check — STANDALONE ENGINE (replaced).
   The old office-proxy/bot-wall check (office reports, guest slot, designated
   follow, channel-watch fallbacks, autostop seeding) was removed. This file
   keeps every export name + signature so callers (App, WatchLive, blocks,
   editor, store, cms, recentstreams) compile unchanged, but the behavior is
   the standalone player's: explicit youtubeId verifies first (noembed ->
   oEmbed); otherwise the channel's /live page is read (direct + public
   proxies). No office server, no guest slot, no silent channel follows. */

import { useEffect, useState, useSyncExternalStore } from "react";
import { LIVE } from "../data/live";
import { parseYoutubeId, cleanChannelInput } from "./embed";
import { BUILD_NOTES, readStore, writeStore } from "./hooks";
import {
  peekVerified as peekStandalone,
  forgetVerified as forgetStandalone,
  forgetAllVerified as forgetAllStandalone,
  verifyYoutubeId as verifyStandalone,
  oembedPlayable as oembedStandalone,
  readLivePage as readStandalonePage,
  checkChannelLive,
  livePageUrl,
} from "./standaloneLive";

export type LiveState = "live" | "off" | "unset" | "unknown";
export type LivePlatform = "youtube" | "facebook";
export type LiveStatus = {
  state: LiveState;
  platform: LivePlatform | "";
  videoId: string;
  title: string;
  channelId: string;
  target: string;
  checkedAt: number;
  endedAt: number;
};

export const LIVE_STATUS_KEY = "wom.livestatus";
export const SOON_MS = 20_000;
export const IDLE_MS = 90_000;

export const DESIGNATED_CHANNEL_IDS: Record<string, string> = {
  "@twocorg": "UCQ0KIUXUV7gTZmDDlvd3ZcQ",
};

const EMPTY: LiveStatus = { state: "unset", platform: "", videoId: "", title: "", channelId: "", target: "", checkedAt: 0, endedAt: 0 };

/* --------------------------------------------------------------- the target */

export function liveTarget(): { url: string; kind: "channel" | "video" } | null {
  const raw = cleanChannelInput(LIVE.youtubeChannel);
  if (raw) {
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

/** Guest slot removed with the standalone swap: always null. Kept so the
    office drawer + Watch page compile without edits. */
export function guestTarget(_channelInput?: string): { url: string; kind: "channel" | "video" } | null {
  return null;
}

export function isGuestTargetUrl(targetUrl: string, guestUrl: string): boolean {
  const t = String(targetUrl || "");
  const g = String(guestUrl || "");
  return !!t && !!g && t === g;
}

export function facebookTarget(): string {
  const raw = String(LIVE.facebookUrl || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    const url = raw.replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (/facebook\.com\/[^/]+$/i.test(url) && !/facebook\.com\/(?:watch|video|videos|reel|share|permalink)/i.test(url)) {
      return url + "/live";
    }
    return url;
  }
  if (/^\/?[\w.-]+$/.test(raw)) return `https://www.facebook.com/${raw.replace(/^\/+/, "")}/live`;
  return "";
}

/* ------------------------- page reads (standalone port) ------------------------- */

function decodeEntities(value: string): string {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parseLivePage(html: string, _pageUrl = ""): { read: boolean; live: boolean; videoId: string; title: string } {
  const p = readStandalonePage(html);
  let title = "";
  try {
    const m = /<meta property="og:title" content="([^"]*)"/.exec(String(html || ""));
    if (m) title = decodeEntities(m[1] || "");
  } catch { /* title stays empty */ }
  return { read: p.hasYt, live: p.live, videoId: p.videoId, title };
}

export function channelLiveVideoId(html: string): string {
  return readStandalonePage(html).videoId;
}

export function channelCandidateIds(html: string, limit = 3): string[] {
  const out: string[] = [];
  try {
    const re = /(?:watch\?v=|\/live\/|\/embed\/|\/v\/|youtu\.be\/)([\w-]{11})/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(html || ""))) && out.length < limit) {
      const id = parseYoutubeId(m[1] || "");
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  } catch { /* return what we have */ }
  return out;
}

export function extractChannelId(html: string, _targetUrl = ""): string {
  try {
    const m = /"channelId":"(UC[\w-]{20,24})"/.exec(String(html || "")) || /"ownerChannelId":"(UC[\w-]{20,24})"/.exec(String(html || ""));
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

export function watchChannelId(watchHtml: string): string {
  return extractChannelId(watchHtml);
}

export function ownerAllowsCandidate(_ownerChannelId: string, _candidateChannelId: string): boolean {
  return true;
}

export function designatedChannelId(channelInput?: string): string {
  const cleaned = cleanChannelInput(channelInput === undefined ? LIVE.youtubeChannel : channelInput);
  if (!cleaned) return "";
  return DESIGNATED_CHANNEL_IDS[cleaned.toLowerCase()] || "";
}

export function designatedChannelIdForTarget(targetUrl: string): string {
  const url = String(targetUrl || "");
  const id = /(UC[\w-]{20,24})/.exec(url);
  if (id) return id[1];
  const at = /youtube\.com\/@([\w.-]+)/i.exec(url);
  if (at) return DESIGNATED_CHANNEL_IDS[("@" + at[1]).toLowerCase()] || "";
  return "";
}

export function isDesignatedChannel(channelId: string, designatedId: string): boolean {
  const c = String(channelId || "");
  const d = String(designatedId || "");
  if (!d || !c) return true;
  return c === d;
}

export function candidateStandsForDesignated(candidateChannelId: string, designatedId: string, _fromLiveTab = false): boolean {
  const d = String(designatedId || "");
  if (!d) return true;
  const c = String(candidateChannelId || "");
  if (c) return c === d;
  return _fromLiveTab === true;
}

export function isStatusForTarget(status: { target?: unknown }, targetUrl: string): boolean {
  const stamped = String((status && status.target) || "");
  if (!stamped) return true;
  return stamped === String(targetUrl || "");
}

export function inheritEnded(
  before: LiveStatus,
  targetUrl: string,
  checkedAt: number,
  designatedId = ""
): { endedAt: number; videoId: string; title: string; channelId: string; platform: LivePlatform | "" } {
  if ((before.state === "live" || before.endedAt > 0) && isStatusForTarget(before, targetUrl)) {
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

export type ScreenShut = { playing: string } | null;

export function nextScreenShut(prevShut: ScreenShut, wasLiveTarget: string, guestUrl: string, isLive: boolean, nowLiveTarget: string, isOff = false): ScreenShut {
  const was = String(wasLiveTarget || "");
  const guest = String(guestUrl || "");
  const now = String(nowLiveTarget || "");
  if (prevShut && isLive && now && now !== was) return null;
  if (was && guest && was === guest && isLive && now && now !== guest) return { playing: now };
  if (was && isOff) return { playing: was };
  return prevShut;
}

export function officeStopActive(live: unknown): boolean {
  if (!live || typeof live !== "object") return false;
  const l = live as Record<string, unknown>;
  if (!!l.isLive) return false;
  if (String(l.liveEndedBy || "") !== "office") return false;
  if (!(Number(l.liveCut) > 0)) return false;
  if (Number(l.liveSince) !== 0) return false;
  return true;
}

export function clearGuestOnStop(live: unknown): unknown {
  return live;
}

export function unverifiedChannelAnswer(
  live: boolean,
  title: string,
  channelId: string,
  designatedId = ""
): { state: LiveState; videoId: string; title: string; channelId: string } {
  const d = String(designatedId || "");
  if (live && channelId && (!d || channelId === d)) return { state: "live", videoId: "", title, channelId };
  if (live) return { state: "unknown", videoId: "", title: "", channelId: "" };
  return { state: "off", videoId: "", title: "", channelId: "" };
}

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
    videoId: /"video_?[Ii]d"\s*:\s*"?(\\d{8,25})/.exec(text)?.[1] || "",
    title: decodeEntities(/<meta property="og:title" content="([^"]*)"/.exec(text)?.[1] || ""),
  };
}

export type LiveReport = { target: string; state: "live" | "off"; videoId: string; title: string; channelId: string; checkedAt: number; notes: number };

export function reportMatchesBuild(rep: { notes?: unknown }): boolean {
  return Number(rep?.notes) === BUILD_NOTES;
}

export function reportCarriesVideo(rep: { state?: unknown; videoId?: unknown }): boolean {
  if (String((rep && rep.state) || "") !== "live") return true;
  return !!String((rep && rep.videoId) || "");
}

/* ------------------------------- the check ------------------------------- */

const CHECK_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("live check timed out")), ms);
    promise.then(
      (value) => { window.clearTimeout(id); resolve(value); },
      (err) => { window.clearTimeout(id); reject(err); }
    );
  });
}

/** Standalone check: explicit id first, else the channel's /live page. Never throws. */
export async function checkLiveStream(_opts: { facebook?: boolean } = {}): Promise<LiveStatus> {
  const target = liveTarget();
  const now = Date.now();
  if (!target) return { ...EMPTY, state: "unset", checkedAt: now };
  try {
    // Explicit named video: verify it directly (the reliable switch).
    if (target.kind === "video") {
      const vid = parseYoutubeId(target.url);
      if (!vid) return { ...EMPTY, state: "unset", checkedAt: now };
      const v = await withTimeout(verifyStandalone(vid), CHECK_TIMEOUT_MS).catch(() => null);
      if (v === false) return { state: "off", platform: "youtube", videoId: vid, title: "", channelId: "", target: target.url, checkedAt: now, endedAt: 0 };
      if (v === true) return { state: "live", platform: "youtube", videoId: vid, title: "", channelId: "", target: target.url, checkedAt: now, endedAt: 0 };
      return { state: "unknown", platform: "", videoId: vid, title: "", channelId: "", target: target.url, checkedAt: now, endedAt: 0 };
    }
    // Channel mode: the office's explicit youtubeId wins when set (standalone CONFIG).
    const explicit = parseYoutubeId(LIVE.youtubeId || "");
    if (explicit) {
      const v = await withTimeout(verifyStandalone(explicit), CHECK_TIMEOUT_MS).catch(() => null);
      if (v === false) {
        // Dead explicit id: fall through to the channel read below.
      } else if (v === true) {
        return { state: "live", platform: "youtube", videoId: explicit, title: "", channelId: "", target: target.url, checkedAt: now, endedAt: 0 };
      } else {
        return { state: "unknown", platform: "", videoId: explicit, title: "", channelId: "", target: target.url, checkedAt: now, endedAt: 0 };
      }
    }
    const channelInput = String(LIVE.youtubeChannel || "");
    const found = await withTimeout(checkChannelLive(channelInput), CHECK_TIMEOUT_MS + 7_000).catch(() => ({ kind: "unknown" as const }));
    if (found.kind === "live") {
      const vid = parseYoutubeId(found.videoId);
      const v = await withTimeout(verifyStandalone(vid), CHECK_TIMEOUT_MS).catch(() => null);
      if (v === false) return { state: "off", platform: "youtube", videoId: "", title: "", channelId: "", target: target.url, checkedAt: now, endedAt: 0 };
      return { state: "live", platform: "youtube", videoId: vid, title: "", channelId: "", target: target.url, checkedAt: now, endedAt: 0 };
    }
    if (found.kind === "off") return { state: "off", platform: "", videoId: "", title: "", channelId: "", target: target.url, checkedAt: now, endedAt: 0 };
    return { ...EMPTY, state: "unknown", target: target.url, checkedAt: now };
  } catch {
    return { ...EMPTY, state: "unknown", target: target?.url || "", checkedAt: now };
  }
}

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
  if (status.state === "unknown") return;
  writeStore(LIVE_STATUS_KEY, status);
}

export type LiveSnapshot = { status: LiveStatus; checking: boolean };
type Watcher = { soon: boolean; facebook: boolean; urgent: boolean };

let snapshot: LiveSnapshot = { status: readLiveStatus(), checking: false };
try {
  if (snapshot.status.state === "live" && Date.now() - Number(snapshot.status.checkedAt || 0) > 60_000) {
    snapshot = { status: { ...snapshot.status, state: "unknown" as LiveState }, checking: false };
  }
} catch { /* keep the stored answer */ }

const watchers = new Set<Watcher>();
const listeners = new Set<() => void>();
let timer = 0;
let polling = false;
let offStreak = 0;
let lastCheckAt = 0;
let lastTarget = "";

function readSnapshot(): LiveSnapshot {
  return snapshot;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit() {
  for (const fn of [...listeners]) {
    try { fn(); } catch { /* noop */ }
  }
}

export function setLiveReportSink(_fn: ((rep: LiveReport) => void) | null): void {}

export function liveNow(): boolean {
  return snapshot.status.state === "live";
}

export function guestLiveNow(): boolean {
  return false;
}

export function mainLiveNow(): boolean {
  try {
    const t = liveTarget()?.url || "";
    if (!t) return false;
    const s = snapshot.status;
    if (s.state !== "live" || s.platform !== "youtube") return false;
    if (!isStatusForTarget(s, t)) return false;
    return true;
  } catch {
    return false;
  }
}

export function liveEndedAt(): number {
  return Number(snapshot.status.endedAt) || 0;
}

export function useLiveStatus(): LiveSnapshot {
  return useSyncExternalStore(subscribe, readSnapshot, readSnapshot);
}

function wantsSoon() {
  if (snapshot.status.state === "live") return true;
  for (const watcher of watchers) if (watcher.soon) return true;
  return false;
}

function wantsUrgent() {
  for (const watcher of watchers) if (watcher.urgent) return true;
  return false;
}

function targetSignature() {
  try {
    return `${liveTarget()?.url || ""}|${facebookTarget()}`;
  } catch {
    return "";
  }
}

export function liveTargetSignature(): string {
  try {
    return targetSignature();
  } catch {
    return "";
  }
}

function delay() {
  if (wantsUrgent()) return 8_000;
  return wantsSoon() ? SOON_MS : IDLE_MS;
}

function schedule(ms: number) {
  try {
    if (polling && targetSignature() !== lastTarget) ms = 0;
  } catch { /* keep the wait */ }
  window.clearTimeout(timer);
  const jitter = Math.floor(Math.random() * 2000) - 1000;
  timer = window.setTimeout(() => { void poll(); }, Math.max(0, ms + jitter));
}

async function poll() {
  if (!watchers.size) {
    polling = false;
    return;
  }
  polling = true;
  lastTarget = targetSignature();
  const before = snapshot.status;
  snapshot = { status: before, checking: true };
  emit();
  try {
    const next = await withTimeout(checkLiveStream(), CHECK_TIMEOUT_MS + 9_000).catch(() => null);
    lastCheckAt = Date.now();
    if (next) {
      if (next.state === "off" && before.state === "live" && isStatusForTarget(before, next.target)) {
        offStreak += 1;
        if (offStreak < 2) {
          snapshot = { status: { ...before, checkedAt: next.checkedAt }, checking: false };
          emit();
          schedule(delay());
          return;
        }
      } else {
        offStreak = 0;
      }
      if (next.state === "off" && before.state === "live" && isStatusForTarget(before, next.target)) {
        const kept = inheritEnded(before, next.target, next.checkedAt);
        (next as LiveStatus).endedAt = kept.endedAt || next.checkedAt;
        (next as LiveStatus).videoId = (next as LiveStatus).videoId || kept.videoId;
        (next as LiveStatus).title = (next as LiveStatus).title || kept.title;
      } else {
        offStreak = next.state === "off" ? offStreak : 0;
      }
      snapshot = { status: next as LiveStatus, checking: false };
      saveLiveStatus(next as LiveStatus);
    } else {
      snapshot = { status: before, checking: false };
    }
  } catch {
    snapshot = { status: before, checking: false };
  }
  emit();
  schedule(delay());
}

function startPolling() {
  if (polling) return;
  polling = true;
  void poll();
}

function stopPolling() {
  polling = false;
  window.clearTimeout(timer);
}

export function watchLiveStream(opts: { soon?: boolean; facebook?: boolean; urgent?: boolean } = {}) {
  const watcher: Watcher = { soon: !!opts.soon, facebook: !!opts.facebook, urgent: !!opts.urgent };
  const first = watchers.size === 0;
  watchers.add(watcher);
  if (first) startPolling();
  else if (watcher.urgent || targetSignature() !== lastTarget) schedule(0);
  else if (watcher.soon && Date.now() - lastCheckAt > SOON_MS) schedule(150);
  return () => {
    watchers.delete(watcher);
    if (!watchers.size) stopPolling();
  };
}

export function recheckLiveNow(): void {
  try {
    schedule(0);
  } catch { /* noop */ }
}

export function noteLiveTargetMayHaveChanged(): void {
  try {
    if (targetSignature() !== lastTarget) schedule(0);
  } catch { /* noop */ }
}

export function useLiveStream(soon = false, watchFacebook = false, urgent = false) {
  const { status, checking } = useLiveStatus();
  useEffect(() => watchLiveStream({ soon, facebook: watchFacebook, urgent }), [soon, watchFacebook, urgent]);
  const signature = liveTargetSignature();
  useEffect(() => {
    noteLiveTargetMayHaveChanged();
  }, [signature]);
  return { ...status, checking } as LiveStatus & { checking: boolean };
}

/* ------------------------------- playable check ------------------------------- */

export function oembedPlayable(status: number): boolean | null {
  return oembedStandalone(status);
}

export function peekVerified(videoId: string): boolean | null {
  return peekStandalone(videoId);
}

export function forgetVerified(videoId: string): void {
  forgetStandalone(videoId);
}

export function forgetAllVerified(): void {
  forgetAllStandalone();
}

export function verifyYoutubeId(videoId: string): Promise<boolean | null> {
  return verifyStandalone(videoId);
}

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
      .then((v) => { if (alive) setVerdict(v); })
      .catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return verdict;
}

// Re-export the standalone page URL helper for callers that built it from livestatus.
export { livePageUrl };
