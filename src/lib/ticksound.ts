/* ============================================================================
   The tick of the waiting clock.

   While a service has started and the stream has not opened yet, the Watch live
   screen holds a ticking clock (src/components/liveclock.tsx). The tick is
   *made*, not shipped: a browser can synthesise a mechanical tick out of a
   short noise burst and a small wooden body, so the site carries no audio file
   and no download — which matters for the one screen a visitor reaches on a
   Sunday morning on a phone.

   A tick is two sounds a hand's width apart:

     - a **click** — white noise through a band-pass around 2.1–2.7 kHz with a
       55 ms exponential decay, which is the escapement's own noise, and
     - a **body** — a triangle wave at 150–175 Hz with a 90 ms decay, which is
       the wood (and a soft sine an octave below the click would be tin, not
       wood, on a phone's speaker).

   The pair alternates every second (tick … tock …) and the minute's tick is
   slightly louder and lower, the way a wall clock's minute hand lands harder
   than the seconds hand. Nothing is played while the tab is hidden.

   **It is deliberately light.** A tick is the sound a visitor is *not* meant to
   be listening to — it sits under the words and under whatever else is playing,
   so the master gain is a tenth of what a click effect would use (0.13, 0.18 on
   the minute) and the click is band-passed high and decayed fast, with the low
   body kept quieter than the click. The office asked for it *lighter* once it
   was on the screen, which is why the numbers look almost too small: measured at
   the volume a phone speaker actually produces, that is a clock in the next room
   rather than one on the desk.

   **Sound cannot start before the visitor has touched the page.** Every browser
   refuses to run an audio context until then — and creating one earlier is what
   makes Chrome log "The AudioContext was not allowed to start". So the context
   is created the moment the page *counts* as touched: at once when the browser
   already reports the page as activated (a visitor who clicked their way here),
   otherwise inside the first pointer, key or touch
   (`useTickSound` in src/components/liveclock.tsx). There is no switch for the
   tick — it plays quietly under the words.
   ========================================================================== */

export type TickHandle = {
  /** Is a tick being played right now? */
  running: boolean;
  /** Did the visitor turn it off (it stays off for the session)? */
  muted: boolean;
  toggle: () => void;
};

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** The click's noise, made once per sample rate and kept. */
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const length = Math.max(1, Math.floor(c.sampleRate * 0.09));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const decay = 1 - i / length;
    data[i] = (Math.random() * 2 - 1) * decay * decay;
  }
  noise = buffer;
  return buffer;
}

/** Is the sound actually being made at this moment? */
export function ticking(): boolean {
  return !!ctx && ctx.state === "running" && !muted;
}

export function tickMuted(): boolean {
  return muted;
}

/**
 * Wake the audio up. The first call has to come from a gesture the visitor
 * made (see the note at the top of this file) — the screen starts it on the
 * first touch rather than on mount for exactly this reason.
 */
export async function startTicking(): Promise<boolean> {
  const c = context();
  if (!c) return false;
  try {
    if (c.state !== "running") await c.resume();
  } catch {
    return false;
  }
  return c.state === "running";
}

/**
 * One tick. `tock` is the off beat, `accent` the minute turning over — the
 * handful of moments where the second hand lands harder than the rest.
 *
 * The levels are low on purpose (see the note at the top of this file): this is
 * a clock somewhere behind the words, not an effect.
 */
export function playTick(tock = false, accent = false) {
  const c = context();
  if (!c || c.state !== "running" || muted) return;
  if (document.visibilityState === "hidden") return;
  const t = c.currentTime + 0.004;

  const click = c.createBufferSource();
  click.buffer = noiseBuffer(c);
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = (tock ? 1900 : 2450) * (accent ? 0.88 : 1);
  band.Q.value = 1.1;
  const high = c.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 1100;
  const clickGain = c.createGain();

  const body = c.createOscillator();
  body.type = "triangle";
  body.frequency.value = (tock ? 148 : 176) * (accent ? 0.92 : 1);
  const bodyGain = c.createGain();

  const master = c.createGain();
  master.gain.value = accent ? 0.18 : 0.13;

  clickGain.gain.setValueAtTime(0.0001, t);
  clickGain.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

  bodyGain.gain.setValueAtTime(0.0001, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.2, t + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);

  click.connect(band);
  band.connect(high);
  high.connect(clickGain);
  clickGain.connect(master);
  body.connect(bodyGain);
  bodyGain.connect(master);
  master.connect(c.destination);

  click.start(t);
  click.stop(t + 0.12);
  body.start(t);
  body.stop(t + 0.12);
}
