/* ============================================================================
   The stop that makes itself.

   The office should not have to be watching the drawer when a service ends. The
   stream goes off air on the channel the site watches, and the website is done
   with it: this is the piece that notices. It watches `useLiveStream` from the
   office's own drawer (`src/pages/Admin.tsx` mounts it), and when a broadcast it
   had seen go live comes back ended, it does exactly what *Stop the livestream*
   does —

     - `LIVE.isLive` is turned off and `LIVE.liveCut` stamped with the moment the
       stream ended, so the site stops showing LIVE NOW and the service clock for
       that gathering is silenced with it (`onAir` in src/lib/store.ts);
     - the broadcast that was on air is written into *Recent services* and every
       open page is poked to read the channel again (`askForRecentServices` in
       src/lib/recentstreams.ts), so the finished service is in the list in the
       same breath — before YouTube has published the recording;
     - the office is told, in the panel and in a toast, that it was the stream
       that ended and not them (`liveEndedBy`).

   It is deliberately careful, because this is a machine writing content:

     - **Only a definitive answer counts.** A check that could not be made
       ("unknown") never ends anything, and "off" has to be seen twice in a row
       (about a minute apart) before the drawer acts — one flaky read of the
       channel page must not close a service (see `src/lib/livestatus.ts`).
     - **Only a broadcast we saw live can end.** The status carries `endedAt`,
       set the moment a "live" answer is followed by "off", so a channel that was
       never on air cannot stop the site, and a stop the office has already made
       for that same stream is left alone.
     - **Only a site that is on air is stopped** — the office's own *Start*, or
       the service clock's gathering. Nothing is written when there was nothing
       to stop, so the week never fills with unpublished changes.
     - **It writes the draft, never the published site.** The office still presses
       Publish, exactly as they do for every other change (SPEC note 111).

   Since SPEC note 133 this write is no longer the only thing that takes *Live
   now* off the site — a browser that watched the stream end stops showing it by
   itself, because `onAir()` reads the ending straight off the live check
   (`streamCut()` in src/lib/store.ts). What this watcher still adds is the
   *record*: the office's own on-air switch turned off, the clock of the
   interrupted gathering silenced for the rest of its hours, and the finished
   service filed into *Recent services*. So it is the office's bookkeeping, not
   the display — and it only runs with `#/admin` open.
   ========================================================================== */

import { useEffect, useRef } from "react";
import * as cms from "./cms";
import { fireToast } from "./hooks";
import { nextService, churchTimezone } from "./store";
import { SERVICES } from "../data/site";
import { useLiveStream, type LiveStatus } from "./livestatus";
import { askForRecentServices } from "./recentstreams";

/** The live section as the office's own draft has it. */
function draftLive(): any {
  return cms.getDraft().live || {};
}

/**
 * End the session the way the office's *Stop the livestream* does, because the
 * stream itself has ended.
 */
function stopForStream(live: any, air: LiveStatus): boolean {
  const endedAt = Number(air.endedAt) || 0;
  if (!endedAt) return false;
  const cut = Number(live.liveCut) || 0;
  /* Already stopped for this very stream (the office's press, or an earlier
     pass of this watcher): nothing to do. */
  if (cut >= endedAt) return false;

  const now = new Date();
  const info = nextService(SERVICES, now, churchTimezone());
  const clockLive = !!info?.isLive && !(cut >= info.at.getTime());
  /* Nothing was on air: nothing to end, and no reason to fill the week with
     unpublished changes. */
  if (!live.isLive && !clockLive) return false;
  /* The ending has to belong to *this* session — an ending from a service last
     Sunday must never close today's gathering — and the office's word beats it:
     an ending older than their last *Start* / *Continue* / *Stop* is history,
     not news (pressing *Continue* on a stream the site had already stopped must
     not get stopped again a minute later). */
  const started =
    Number(live.liveCommandAt) || Number(live.liveSince) || (info?.isLive ? info.at.getTime() : 0);
  if (started && endedAt < started) return false;

  cms.setSectionValue("live", {
    ...live,
    isLive: false,
    liveCut: endedAt,
    liveEndedBy: "channel",
  });
  /* The finished service goes into *Recent services* now: the broadcast that was
     on air is written into the list (id and headline from the check) and every
     open page reads the channel again. Only a YouTube broadcast can be seeded —
     *Recent services* is built out of YouTube videos, and a Facebook live's id
     is not one of them; for a Facebook ending the poke alone is right, and the
     read finds the recording when YouTube publishes it. */
  askForRecentServices(
    air.platform === "youtube" && air.videoId ? { videoId: air.videoId, title: air.title } : undefined
  );

  const where = air.platform === "facebook" ? "Facebook" : "YouTube";
  fireToast(
    `The stream ended on ${where}, so the site went off air by itself. The finished service is in Recent services — publish to put it on the website.`,
    "info"
  );
  return true;
}

/**
 * Watch the stream from the office's drawer: when a broadcast that was on air
 * ends, stop the site the same way the button does. Nothing else in the app
 * calls this, and it only ever runs while the office has `#/admin` open.
 */
export function useAutoStopLive(enabled = true) {
  /* The office's own *Start* / *Stop* re-render this (they write the draft). */
  cms.useCmsVersion();
  const live = draftLive();
  /* The switch is the only hint worth passing: the check runs on the short
     cadence anyway once it has seen the church on air. */
  const air = useLiveStream(!!live.isLive, true);

  const offStreak = useRef(0);
  const handled = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (air.state === "live") {
      offStreak.current = 0;
      return;
    }
    if (air.state === "off") {
      /* A service is closed only on the second answer in a row: one read of the
         channel page that came back without its markers is not an ending. */
      offStreak.current += 1;
      if (offStreak.current < 2) return;
      const endedAt = Number(air.endedAt) || 0;
      if (!endedAt || endedAt === handled.current) return;
      handled.current = endedAt;
      stopForStream(draftLive(), air);
      return;
    }
    if (air.state === "unset") offStreak.current = 0;
    /* "unknown" is the check saying nothing, not the stream saying it stopped —
       it neither counts towards the two answers nor throws them away. */
  }, [enabled, air.state, air.checkedAt, air.endedAt]);

  return air;
}
