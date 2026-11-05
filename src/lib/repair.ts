/* One-tap repair behind every error notice (`ErrorBoundary` + `SectionBoundary`).
   A bare browser reload cannot fix a page poisoned by its own volatile caches
   (a stale on-air answer, a dead verdict, a thin recents list re-read as
   truth) — so the retry button drops them all first, then remounts in place;
   only a crash that repeats on the same route takes the full reload, and that
   reload carries a session flag so the boot starts clean too. Office words,
   drafts, history and the publish queue are NEVER touched here: those are
   blessed content, not volatile cache. */

import { clearRecentCaches } from "./recentstreams";
import { forgetAllVerified, recheckLiveNow } from "./livestatus";

/** Volatile live/streaming caches a retry must never re-read. */
const VOLATILE_KEYS = ["wom.livestatus", "wom.live.targetNote"];

/** The session flag a repair reload leaves for the next boot. */
export const REPAIR_FLAG = "wom.repair";

/** Drop every volatile live cache; never throws. Safe on any page. */
export function dropVolatileCaches(): void {
  try {
    forgetAllVerified();
  } catch {}
  try {
    clearRecentCaches();
  } catch {}
  for (const k of VOLATILE_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {}
    try {
      sessionStorage.removeItem(k);
    } catch {}
  }
}

/** The error card's repair pass: clean caches, then re-ask what's live now. */
export function repairLiveCaches(): void {
  dropVolatileCaches();
  try {
    recheckLiveNow();
  } catch {}
}

/** Reload that boots clean: flag + drop, then the browser reload. */
export function repairReload(): void {
  try {
    sessionStorage.setItem(REPAIR_FLAG, "1");
  } catch {}
  dropVolatileCaches();
  try {
    window.location.reload();
  } catch {
    /* reload unavailable — the card stays with its way home */
  }
}
