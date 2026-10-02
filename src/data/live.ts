/* ============================================================================
   The live stream.

   The church broadcasts on YouTube and on Facebook, so this file says which
   one the site should open by default plus both addresses. Everything here is
   editable from the admin console (Live stream section) — nothing in this file
   needs to be touched to change a stream link.

   Nothing is filed anywhere from here. A service that finishes lands in
   "Recent services" on the Watch live page by itself — that list is read from
   the church's channel (`src/lib/recentstreams.ts`) and holds the last six.
   "Previous sermons" is the office's own work: each message is written up and
   uploaded in the console's Sermons section.

   The three numbers those lists are built on are the office's, not the code's:
   `recentLimit` (how many finished services the band keeps), `turnaroundHours`
   (how long the office says a write-up takes) and `pastLimit` (how many of the
   write-ups *Previous sermons* lists). All three are
   fields in the console's Live stream section, and the pages read them through
   `recentLimit()` / `sermonTurnaroundHours()` / `pastLimit()` below, which clamp
   whatever is stored — so a section's line can never promise a number its list
   does not keep.
   ========================================================================== */

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

/**
 * How many finished services *Recent services* holds (Live stream → *How many
 * recent services to show*). Call it with the value being edited to see what
 * that number would do; call it with nothing to read the live one.
 */
export function recentLimit(value?: unknown): number {
  return bounded(value === undefined ? LIVE.recentLimit : value, RECENT_LIMIT, LIMIT_BOUNDS);
}

/** How long the office says a write-up takes (Live stream → *Hours until it is written up*). */
export function sermonTurnaroundHours(value?: unknown): number {
  return bounded(value === undefined ? LIVE.turnaroundHours : value, TURNAROUND_HOURS, HOURS_BOUNDS);
}

/**
 * How many of the office's own write-ups *Previous sermons* lists (Live stream
 * → *How many previous sermons to show*). The band is the newest of the archive,
 * so as a new message is published the oldest one drops off it — nothing is
 * deleted, and the full archive keeps every message.
 */
export function pastLimit(value?: unknown): number {
  return bounded(value === undefined ? LIVE.pastLimit : value, PAST_LIMIT, PAST_BOUNDS);
}

/**
 * The video ids the office has taken off *Recent services* (Live stream →
 * *Recent services*), as a set to look up. A visitor's list is read from the
 * channel on their own browser, so the filtering happens where the list is
 * built — see `src/pages/WatchLive.tsx`.
 */
export function hiddenReplays(): Set<string> {
  const list = Array.isArray(LIVE.hiddenReplays) ? LIVE.hiddenReplays : [];
  return new Set(list.map((id) => String(id || "").trim()).filter(Boolean));
}

/**
 * A card under "Ways to watch" (the Watch live page and the sermon archive).
 * `platform` marks the card as *that platform's door*: the card then carries an
 * "Open YouTube" / "Open Facebook" button pointing at whatever address the
 * office has given us (the stream link, the channel, or the site's socials). A
 * card without it — Live stream, Sermon archive — is words only.
 */
export type WatchOption = { label: string; value: string; icon: string; platform?: VideoPlatform };

export const LIVE = {
  /** Which player opens first. The visitor can switch if both are set. */
  provider: "youtube" as VideoPlatform,
  /** A YouTube video id, or any YouTube link — the id is pulled out of it. */
  youtubeId: "",
  /**
   * The church's YouTube channel — a handle (@name), a channel id, or any
   * channel link. When it is set, the Watch live page asks YouTube whether
   * that channel is broadcasting right now, so the screen flips to the live
   * service by itself and back to "live has ended" when the stream stops
   * (see src/lib/livestatus.ts). The same channel is what fills *Recent
   * services* with the last six finished services (src/lib/recentstreams.ts).
   * Leave it empty and only the link above is watched, plus the "we are on air
   * right now" switch.
   *
   * The church's own channel is **@twocorg** ("TWOC") — the office's livestream
   * link, `https://youtube.com/@twocorg` (the `?si=…` on a shared link is
   * tracking noise). It is left empty here because it is *their* setting: the
   * office types it in the drawer's *Live stream* section, so it lives in their
   * draft and in the published content rather than in the shipped defaults
   * (SPEC note 112).
   */
  youtubeChannel: "",
  /** A public Facebook video / live-video link. */
  facebookUrl: "",
  /**
   * How many finished services *Recent services* keeps. The office sets it in
   * the console; as a new service comes off air the oldest drops off the end,
   * and anything older stays on the church's YouTube channel and Facebook page,
   * which is what the section's line tells the visitor.
   */
  recentLimit: RECENT_LIMIT,
  /**
   * How long the office says it takes to write a service up and upload it as a
   * sermon. *Previous sermons* promises the visitor this many hours (and the
   * console's *When the service ends* panel repeats it).
   */
  turnaroundHours: TURNAROUND_HOURS,
  /**
   * How many of those write-ups *Previous sermons* lists, newest first. The odd
   * one out as a new message is published is the oldest, which drops off the
   * band — the archive itself keeps everything.
   */
  pastLimit: PAST_LIMIT,
  /** Headline while the stream is on air. */
  liveTitle: "Sunday Celebration — live",
  /**
   * The office's switch: on air now, whatever the clock says. It is not typed
   * in anywhere — the console's *Live stream* section has the *Start* /
   * *Continue* / *Stop* buttons that set it (and `liveSince` / `liveCut` with
   * it), so the site can be put on air for a broadcast that is not on the
   * schedule, or taken off it when a gathering has moved.
   */
  isLive: false,
  /**
   * When the office pressed *Start* or *Continue* — ms since the epoch, 0 if no
   * session has been started. The console reads it to say how long the stream
   * has been on air, and keeps it across a *Stop* so that *Continue* resumes
   * the same session rather than beginning a new one.
   */
  liveSince: 0,
  /**
   * When the office pressed *Stop* — ms since the epoch, 0 if never. It also
   * silences the service clock for the gathering it interrupted: a service the
   * office has deliberately ended must not go back on air by itself a minute
   * later (see `onAir` in src/lib/store.ts).
   */
  liveCut: 0,
  /**
   * Who ended the last session: the office, or the stream itself. The drawer
   * writes `"office"` when it is the *Start* / *Continue* / *Stop* buttons, and
   * `"channel"` when the site noticed the broadcast had gone off air on its own
   * and stopped with it (see `useAutoStopLive` in src/lib/autostop.ts). It is
   * what lets the panel say *ended by itself* rather than *stopped*, and it is
   * the office's again the moment they touch the buttons.
   */
  liveEndedBy: "office" as "office" | "channel",
  /**
   * When the office last pressed *Start* / *Continue* / *Stop* — ms since the
   * epoch, 0 if never. The buttons are the office's word, and it is newer than
   * anything the live check has seen: an ending that happened *before* their
   * last command never overrides them (see `useAutoStopLive` in
   * src/lib/autostop.ts), so pressing *Continue* on a stream the site had
   * already stopped does not get stopped again a minute later.
   */
  liveCommandAt: 0,
  /**
   * The finished services the office has taken off the site: video ids of
   * services they do not want under *Recent services* (a test stream, a
   * broadcast that should not be advertised). The list is written by the
   * console's *Recent services* panel, which is also the only place a video
   * comes back from. It hides the video from the site; nothing is deleted from
   * the church's channel.
   */
  hiddenReplays: [] as string[],
  /** The cards under "everywhere you already are". */
  watchOptions: [
    { label: "Live stream", value: "Plays here whenever our broadcast is active", icon: "live" },
    { label: "YouTube", value: "@twocorg", icon: "youtube", platform: "youtube" },
    { label: "Facebook", value: "/worldovercomers", icon: "facebook", platform: "facebook" },
    { label: "Sermon archive", value: "Every message since 2026", icon: "archive" },
  ] as WatchOption[],
};
