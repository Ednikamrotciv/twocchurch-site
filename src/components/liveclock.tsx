import React, { useEffect, useState } from "react";
import { useNow } from "../lib/hooks";
import { playTick, startTicking, tickMuted, ticking } from "../lib/ticksound";
import { ct } from "../data/copy";

/* ============================================================================
   The waiting clock (SPEC note 133).

   The screen the Watch live page holds while the service is on and the stream
   has not opened yet: the last broadcast's own still, faded, with a ticking
   clock over it and the line that says so.

   The clock is **built out of CSS 3D**, not drawn: a face with sixty marks, a
   metal case set behind it in Z, hands on the face and a glass cover floating
   over them, the whole thing swaying slowly on two axes and nudging itself on
   every second the way a real escapement does. The hands are turned from the
   visitor's own device clock — this is a clock, so the time it shows is the
   time where the reader is sitting, and `getHours()` is exactly right here
   (unlike every other time on the site, which is a church instant and goes
   through `src/lib/store.ts`).

   Its tick is synthesised rather than downloaded (src/lib/ticksound.ts), and
   because no browser will start audio before a gesture the button under the
   line turns it on — or the visitor's first touch anywhere on the page does.
   ========================================================================== */

/** The four numerals a clock face needs; the marks say the rest. */
const NUMERALS = [12, 3, 6, 9];

/**
 * The ticking, while this screen is on screen.
 *
 * The tick starts by itself — a clock that has to be switched on is not a
 * clock. What it cannot do is start *before* the visitor has touched the page:
 * no browser runs an audio context until then (and creating one early only
 * earns a console warning). So the sound is started the moment the page counts
 * as touched: straight away when the browser already says this page has been
 * activated, otherwise on the first pointer, key or touch anywhere on it.
 * There is no switch for it — it ticks, quietly, under the words.
 */
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

/**
 * The screen itself: the last broadcast's still, faded, under the ticking
 * clock and the line that says the service is on. `cover` is the still of the
 * last stream we know of (src/pages/WatchLive.tsx) — the same faded treatment
 * the ended state gives it, so the screen is never a blank box.
 */
export function LiveWaiting({ cover }: { cover?: string }) {
  const now = useNow(1000);
  useTickSound();

  return (
    <div className="live-wait">
      {cover ? <img className="live-wait__bg" src={cover} alt="" loading="lazy" /> : null}
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
