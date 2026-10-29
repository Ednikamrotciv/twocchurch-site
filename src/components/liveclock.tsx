import React, { useEffect, useState } from "react";
import { useNow } from "../lib/hooks";
import { playTick, startTicking, tickMuted, ticking } from "../lib/ticksound";
import { ct } from "../data/copy";

/* The waiting clock (note 133): last still, faded, with a ticking CSS-3D clock over it.
   Hands run on the visitor's device clock; tick synthesised (ticksound.ts), started on first touch. */

/** The four numerals a clock face needs; the marks say the rest. */
const NUMERALS = [12, 3, 6, 9];

/** The ticking, while this screen is on: started on the page's first touch. */
function useTickSound() {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let alive = true;
    const wake = () => {
      if (ticking()) {
        setRunning(true);
        return;
      }
      if (tickMuted()) return;
      startTicking().then((ok) => {
        if (alive) setRunning(ok);
      });
    };
    /* A visitor who has already touched the page (they clicked their way here)
       can have the sound at once; anyone else gets it on their first touch. */
    const activation = (navigator as { userActivation?: { hasBeenActive?: boolean } }).userActivation;
    if (!activation || activation.hasBeenActive) wake();
    document.addEventListener("pointerdown", wake);
    document.addEventListener("keydown", wake);
    window.addEventListener("touchstart", wake, { passive: true });
    return () => {
      alive = false;
      document.removeEventListener("pointerdown", wake);
      document.removeEventListener("keydown", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, []);

  /* A tick lands *on the second*, not wherever an interval happened to drift
     to: the next whole second is measured each time and the tick scheduled for
     just after it. Nothing is played while the tab is hidden. */
  useEffect(() => {
    if (!running) return;
    let timer = 0;
    const loop = () => {
      timer = window.setTimeout(() => {
        const second = new Date().getSeconds();
        playTick(second % 2 === 1, second === 0);
        loop();
      }, 1004 - (Date.now() % 1000));
    };
    loop();
    return () => window.clearTimeout(timer);
  }, [running]);
}

function ClockFace({ now }: { now: Date }) {
  const seconds = now.getSeconds();
  const minutes = now.getMinutes();
  const hours = now.getHours();
  return (
    <div className="live-clock" aria-hidden="true">
      <div className="live-clock__sway">
        <div className="live-clock__stage">
          <span className="live-clock__rim" />
          <span className="live-clock__face">
            {Array.from({ length: 60 }, (_, i) => (
              <span
                key={i}
                className={
                  "live-clock__mark" +
                  (i % 5 === 0 ? " live-clock__mark--hour" : "") +
                  (i % 15 === 0 ? " live-clock__mark--quarter" : "")
                }
                style={{ transform: `rotate(${i * 6}deg)` }}
              />
            ))}
            {NUMERALS.map((n) => (
              <b key={n} className={"live-clock__num live-clock__num--" + n}>
                {n}
              </b>
            ))}
            <span className="live-clock__hand live-clock__hand--hour" style={{ transform: `rotate(${(hours % 12) * 30 + minutes * 0.5}deg)` }} />
            <span className="live-clock__hand live-clock__hand--minute" style={{ transform: `rotate(${minutes * 6 + seconds * 0.1}deg)` }} />
            <span className="live-clock__hand live-clock__hand--second" style={{ transform: `rotate(${seconds * 6}deg)` }} />
            <span className="live-clock__pin" />
          </span>
          <span className="live-clock__glass" />
        </div>
      </div>
    </div>
  );
}

/** The screen itself: last still, faded, under the clock (`cover` from WatchLive). */
export function LiveWaiting({ cover }: { cover?: string }) {
  const now = useNow(1000);
  useTickSound();

  return (
    <div className="live-wait">
      {cover ? <img className="live-wait__bg" src={cover} alt="" loading="lazy" onError={(e) => { try { e.currentTarget.style.display = "none"; } catch {} }} /> : null}
      <span className="live-wait__scrim" aria-hidden="true" />
      <div className="live-wait__body">
        <ClockFace now={now} />
        <h3 className="live-wait__title">
          <span className="live-dot" aria-hidden="true" />
          {ct("auto.live.cd89c755a4e3a29c")}</h3>
        <p className="live-wait__text">
          {ct("auto.live.e36e917e01a923ef")}</p>
      </div>
    </div>
  );
}
