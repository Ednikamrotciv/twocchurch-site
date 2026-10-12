/* Live stream settings (all editable in the console): default platform, both addresses,
   and the three list numbers, clamped on read. Finished services file themselves. */

import type { VideoPlatform } from "../lib/embed";

/** What *Recent services* keeps unless the office says otherwise. */
export const RECENT_LIMIT = 6;
/** How long a finished service takes to reach *Previous sermons*, as shipped. */
export const TURNAROUND_HOURS = 5;
/** How many of the office's write-ups *Previous sermons* lists, as shipped. */
export const PAST_LIMIT = 20;
/** The most the office can ask a band to hold, and the least. */
const LIMIT_BOUNDS: [number, number] = [1, 24];
const PAST_BOUNDS: [number, number] = [1, 60];
const HOURS_BOUNDS: [number, number] = [1, 72];
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** A number the office typed, kept inside `bounds`; blank or nonsense → `fallback`. */
function bounded(raw: unknown, fallback: number, bounds: [number, number]): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(n, bounds[0]), bounds[1]);
}

/** 6 → "six" — a page reads better with the word. Past twelve the digits speak. */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] || String(n);
}

/** How many finished services Recent services holds (console-set; oldest drops off). */
export function recentLimit(value?: unknown): number {
  return bounded(value === undefined ? LIVE.recentLimit : value, RECENT_LIMIT, LIMIT_BOUNDS);
}

/** How long the office says a write-up takes (Live stream → *Hours until it is written up*). */
export function sermonTurnaroundHours(value?: unknown): number {
  return bounded(value === undefined ? LIVE.turnaroundHours : value, TURNAROUND_HOURS, HOURS_BOUNDS);
}

/** How many write-ups Previous sermons lists, newest first (archive keeps everything). */
export function pastLimit(value?: unknown): number {
  return bounded(value === undefined ? LIVE.pastLimit : value, PAST_LIMIT, PAST_BOUNDS);
}

/** Video ids taken off Recent services; filtering happens where the list builds. */
export function hiddenReplays(): Set<string> {
  const list = Array.isArray(LIVE.hiddenReplays) ? LIVE.hiddenReplays : [];
  return new Set(list.map((id) => String(id || "").trim()).filter(Boolean));
}

/** A Ways-to-watch card; `platform` adds the Open button for that platform. */
export type WatchOption = { label: string; value: string; icon: string; platform?: VideoPlatform };

export const LIVE = {
  /** Which player opens first. The visitor can switch if both are set. */
  provider: "youtube" as VideoPlatform,
  /** A YouTube video id, or any YouTube link — the id is pulled out of it. */
  youtubeId: "",
  /** The church's YouTube channel (handle, id or link); the office types it in the console (note 112). */
  youtubeChannel: "",
  /** A public Facebook video / live-video link. */
  facebookUrl: "",
  /** Finished-service count; oldest drops off as new ones come off air. */
  recentLimit: RECENT_LIMIT,
  /** Write-up turnaround hours, as promised to the visitor. */
  turnaroundHours: TURNAROUND_HOURS,
  /** How many write-ups Previous sermons lists (oldest drops off; archive keeps all). */
  pastLimit: PAST_LIMIT,
  /** Headline while the stream is on air. */
  liveTitle: "Sunday Celebration — live",
  /** The office's on-air switch, set by the console buttons (not typed). */
  isLive: false,
  /** Start/Continue pressed at (ms); kept across Stop so Continue resumes. */
  liveSince: 0,
  /** Stop pressed at (ms); also silences the interrupted gathering's clock. */
  liveCut: 0,
  /** Who ended it: the office, or the stream itself. */
  liveEndedBy: "office" as "office" | "channel",
  /** Last button press at (ms); endings before it never override the office. */
  liveCommandAt: 0,
  /** Taken-off service ids; the channel keeps them, the site hides them. */
  hiddenReplays: [] as string[],
  /** The cards under "everywhere you already are". */
  watchOptions: [
    { label: "Live stream", value: "Plays here whenever our broadcast is active", icon: "live" },
    { label: "YouTube", value: "@twocorg", icon: "youtube", platform: "youtube" },
    { label: "Facebook", value: "/worldovercomers", icon: "facebook", platform: "facebook" },
    { label: "Sermon archive", value: "Every message since 2026", icon: "archive" },
  ] as WatchOption[],
};
