/* Guest auto-stop: when the temporary guest channel's broadcast ends, the guest
   slot stops by itself — guestIsLive off, guest field emptied — while the
   manual Play/Pause/Stop buttons stay fully intact (they write the same keys,
   and the next manual click always wins). Main slot untouched: only an answer
   stamped for the guest address triggers this, and a guest ending files
   nothing under Recent services, exactly like a manual guest stop. */

import { useEffect, useRef } from "react";
import { useLiveStream, guestTarget, isStatusForTarget } from "./livestatus";
import { getDraft, setSectionValue } from "./cms";

/** Watches the guest address; on its live-to-off edge, stops the guest slot. */
export function useAutoStopLive(enabled = true): null {
  const air = useLiveStream();
  const guestUrl = guestTarget()?.url || "";
  const liveNow = !!guestUrl && air.state === "live" && isStatusForTarget(air, guestUrl);
  const offNow = !!guestUrl && air.state === "off" && isStatusForTarget(air, guestUrl);
  const wasLiveRef = useRef(false);
  useEffect(() => {
    const wasLive = wasLiveRef.current;
    wasLiveRef.current = liveNow;
    if (!enabled || !guestUrl || !wasLive || !offNow) return;
    try {
      const draft = getDraft() as any;
      const live = (draft && draft.live) || {};
      if (!live.guestIsLive && !String(live.externalYoutubeChannel || "").trim()) return;
      const at = Date.now();
      /* Same shape as the manual guest Stop (slot emptied, press stamped), so
         Publish carries it and the transport flips back to Play by itself. */
      setSectionValue("live", { ...live, guestIsLive: false, guestCommandAt: at, externalYoutubeChannel: "" });
    } catch {
      /* the next poll retries */
    }
  }, [enabled, guestUrl, liveNow, offNow]);
  return null;
}
