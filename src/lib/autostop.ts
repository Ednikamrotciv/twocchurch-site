/* The stop that makes itself: when a seen-live broadcast ends, do what *Stop the livestream* does.
   Careful by design — definitive answers only, seen-live streams only, draft only (note 111). */

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
  /* Nothing was on air: nothing to end. */
  if (!live.isLive && !clockLive) return false;
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
  /* File the finished service into Recent services now. */
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

/** Watch the stream from the drawer; stop the site when a live broadcast ends. */
export function useAutoStopLive(enabled = true) {
  /* The office's own Start/Stop re-render this. */
  cms.useCmsVersion();
  const live = draftLive();
  /* Only the switch is passed: the check runs fast once it has seen the church on air. */
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
