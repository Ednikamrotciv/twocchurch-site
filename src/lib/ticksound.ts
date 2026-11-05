/* Waiting-clock tick, synthesised (no audio file): click + wooden body, light under the words.
   Starts on first touch; silent while hidden. */

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

  /** Audio needs a visitor gesture first; the screen starts it on first touch. */
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

/** One tick; `tock` the off beat, `accent` the minute. Kept deliberately quiet. */
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
