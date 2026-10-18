/* The stop that makes itself: when a seen-live broadcast ends, do what *Stop the livestream* does.
   Careful by design — definitive answers only, seen-live streams only, draft only (note 111). */

import { useEffect, useRef } from "react";
import * as cms from "./cms";
import { fireToast } from "./hooks";
import { nextService, churchTimezone } from "./store";
import { SERVICES } from "../data/site";
import { useLiveStream, type LiveStatus, guestTarget, isGuestTargetUrl, liveTarget } from "./livestatus";
import { askForRecentServices } from "./recentstreams";

/** The live section as the office's own draft has it. */
function draftLive(): any {
  return cms.getDraft().live || {};
}

/** Empty a finished guest slot in the draft (note 402): unstamped, like any
    hand edit — the next Publish carries it, while the screen already follows
    the check back to the main channel whether published or not. Only ever
    clears, never fills, and toasts only when something actually moved. The
    guest override switch goes with the slot (note 404). */
function clearIdleGuest(): boolean {
  const latest = cms.getDraft().live || {};
  if (!String((latest as any).externalYoutubeChannel || "").trim() && !(latest as any).guestIsLive) return false;
  cms.setSectionValue("live", { ...latest, externalYoutubeChannel: "", guestIsLive: false });
  fireToast("The guest channel is empty again — Publish sends it.", "info");
  return true;
}

/** End the session the way *Stop the livestream* does — the stream itself ended. */
function stopForStream(live: any, air: LiveStatus): boolean {
  const endedAt = Number(air.endedAt) || 0;
  if (!endedAt) return false;
  const cut = Number(live.liveCut) || 0;
  /* Already stopped for this very stream: nothing to do. */
  if (cut >= endedAt) return false;

  const now = new Date();
  const info = nextService(SERVICES, now, churchTimezone());
  const clockLive = !!info?.isLive && !(cut >= info.at.getTime());
  /* Nothing was on air: nothing to end — unless the main channel self-started
     (note 400): @twocorg needs no Play press and no Publish, so a seen-live
     main-channel ending still files itself with no stamp and no
     need to publish. A guest ending still files nothing. */
  if (!live.isLive && !clockLive) {
    const guestEnd = isGuestTargetUrl(air.target || "", guestTarget()?.url || "");
    /* A finished guest empties its own slot (note 402) — unstamped, so the
       screen is already back on the main channel and the next Publish simply
       carries the empty slot. */
    if (guestEnd) clearIdleGuest();
    if (air.platform !== "youtube" || !air.videoId || guestEnd) return false;
    cms.setSectionValue("live", {
      ...live,
      isLive: false,
      liveCut: endedAt,
      liveEndedBy: "channel",
    });
    /* No stamp, by design (note 394): a natural end needs no publish — the
       screen already fell back to the previous services by itself — so the
       command stays unstamped and the next Publish leaves the on-air state
       alone, whatever else it carries. */
    askForRecentServices({ videoId: air.videoId, title: air.title });
    /* Silent by office request: a natural end needs no publish and raises no
       notice — no need to publish, no toast. The filing above is the record. */
    return true;
  }
  /* The ending must belong to this session; the office's word beats it. */
  const started =
    Number(live.liveCommandAt) || Number(live.liveSince) || (info?.isLive ? info.at.getTime() : 0);
  if (started && endedAt < started) return false;

  cms.setSectionValue("live", {
    ...live,
    isLive: false,
    liveCut: endedAt,
    liveEndedBy: "channel",
  });
  /* No stamp, by design (note 394): a natural end needs no publish — the
     screen already fell back to the previous services by itself — so the
     command stays unstamped and the next Publish leaves the on-air state
     alone, whatever else it carries. */
  /* File the finished service into Recent services now — unless it was the
     temporary guest (note 380): a guest ending files nothing, and the screen
     is already back on the main channel. A finished guest empties its own
     slot too (note 402). */
  const airedGuest = isGuestTargetUrl(air.target || "", guestTarget()?.url || "");
  askForRecentServices(
    air.platform === "youtube" && air.videoId && !airedGuest ? { videoId: air.videoId, title: air.title } : undefined
  );
  if (airedGuest) clearIdleGuest();

  /* Silent by office request on every platform: the end files itself and
     raises no notice — no need to publish, no toast. The filing above is
     the record. */
  return true;
}

/** Watch the stream from the drawer; stop the site when a live broadcast ends. */
export function useAutoStopLive(enabled = true) {
  /* The office's own Start/Stop re-render this. */
  cms.useCmsVersion();
  const live = draftLive();
  /* The main channel is watched even with the switch off (note 400): @twocorg
     starts by itself with no Play press, so the drawer keeps the short
     cadence — and the office report fresh — whenever its address is set. */
  const air = useLiveStream(!!live.isLive || !!liveTarget(), true);

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
