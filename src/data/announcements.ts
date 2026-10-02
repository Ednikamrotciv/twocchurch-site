/* Notices that the church office posts from the admin console (#/admin).
   They render as a dismissible strip under the header and are meant to be
   short-lived: anything older than ANNOUNCEMENT_WINDOW_DAYS drops off. */

import { churchTimezone, pad, zonedParts } from "../lib/store";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  level: "notice" | "important" | "celebration";
  date: string; // YYYY-MM-DD
  link?: string;
  linkLabel?: string;
  active: boolean;
  /** Last day the notice may show, "YYYY-MM-DD" — empty means it never lapses. */
  expiresDate?: string;
  /** Last time on that day, "HH:MM" — empty means the end of the day. */
  expiresTime?: string;
};

export const ANNOUNCEMENT_WINDOW_DAYS = 21;

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "ann-consecration",
    title: "21 Days of Prayer & Fasting begins this week",
    body: "Nightly prayer at 7 PM on the stream, and a printed prayer guide at every branch. Join us as we consecrate the year.",
    level: "celebration",
    date: todayISO(0),
    link: "/watch-live",
    linkLabel: "Watch live",
    active: true,
  },
  {
    id: "ann-parking",
    title: "Parking stewards at the Main Branch this Sunday",
    body: "The north lot is resurfaced, so please arrive 15 minutes early and follow the stewards to the east entrance.",
    level: "notice",
    date: todayISO(-1),
    active: true,
  },
];

function todayISO(offsetDays: number): string {
  /* Today on the *church's* clock (Lagos), not the visitor's: a notice is dated
     the day the office posts it, so reading its age on the visitor's own day
     would hide a notice they posted this morning from a member whose clock is
     still on yesterday (SPEC notes 84/85). */
  const now = zonedParts(new Date(), churchTimezone());
  const d = new Date(Date.UTC(now.year, now.month - 1, now.day + offsetDays));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysAgo(iso: string, now = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "").trim());
  if (!m) return Number.POSITIVE_INFINITY;
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = zonedParts(now, churchTimezone());
  const midnight = Date.UTC(today.year, today.month - 1, today.day);
  return Math.round((midnight - then) / 86400000);
}

/** Active, still-current announcements, newest first. */
export function liveAnnouncements(list: Announcement[] = ANNOUNCEMENTS): Announcement[] {
  return list
    .filter((a) => a && a.active !== false && a.title && !isAnnouncementExpired(a) && daysAgo(a.date) >= 0 && daysAgo(a.date) <= ANNOUNCEMENT_WINDOW_DAYS)
    .sort((a, b) => b.date.localeCompare(a.date) || (a.level === "important" ? -1 : 1));
}

/**
 * When a notice's own time runs out — a local-time instant, or null when no
 * last day was set. No time means the end of the last day.
 */
export function announcementExpiryAt(a: Announcement): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(a?.expiresDate || "").trim());
  if (!m) return null;
  const t = /^(\d{2}):(\d{2})/.exec(String(a?.expiresTime || "").trim());
  const hh = t ? Number(t[1]) : 23;
  const mm = t ? Number(t[2]) : 59;
  if (hh > 23 || mm > 59) return null;
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm, 59).getTime();
  return Number.isFinite(at) ? at : null;
}

/** True once the notice's own last moment has passed. */
export function isAnnouncementExpired(a: Announcement, now: number = Date.now()): boolean {
  const at = announcementExpiryAt(a);
  return at !== null && now > at;
}

/** The list with every lapsed notice taken out. */
export function purgeExpiredAnnouncements(list: Announcement[]): Announcement[] {
  if (!Array.isArray(list)) return list;
  const now = Date.now();
  return list.some((a) => isAnnouncementExpired(a, now)) ? list.filter((a) => !isAnnouncementExpired(a, now)) : list;
}
