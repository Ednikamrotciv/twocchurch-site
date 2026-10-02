/* ============================================================================
   The slide frame.

   Every announcement slide is cut to the *same* frame — **1600×1200, the house
   4:3** — so the slide space on the home page is one shape and one resolution
   whichever announcement is on it, and the office's poster is set into it
   whole: **every pixel of the picture stays exactly as it was** — never
   cropped, never repainted, no blur — centred on its own colours poured full
   at the sides, like the portrait-flyer reference. A
   picture that is *already* the frame's shape and size is left alone entirely
   (the very bytes the office uploaded).

   Two places use it, and between them every slide is in the frame whichever way
   its picture arrived:
     - **the upload** (`frameImageBlob`): what a picture becomes as it is put on
       the site, so every new slide is the frame's shape and resolution from the
       start (see `PhotoUpload` in src/components/editor.tsx, told to frame by
       the slides section's `frame: "slide"`);
     - **the display** (`framedImageUrl`): a picture that is already on the site
       at some other shape — an address the office pasted, or a picture uploaded
       before the frame existed — is cut in the browser as it is shown, and
       remembered for the session, so the space is uniform even on the day the
       frame arrives.

   (A one-press *Fit the slides I have already posted* action, which used to
   re-cut the posted pictures and re-upload them so the stored files themselves
   were the frame, was built and then removed at the office's request — SPEC note
   122b. The display path above is what keeps the space uniform without it.)

   Nothing here ever throws at a caller: a picture that cannot be read or drawn
   is handed back as it was, because an announcement must never go missing over
   a re-cut.
   ========================================================================== */

import { loadPicture } from "./palette";

/** The frame every announcement slide is cut to: 1600×1200 — the house 4:3. */
export const SLIDE_FRAME = { aspect: 4 / 3, width: 1600, height: 1200 } as const;

/** The ground the frame is laid on before the picture's own colours go down. */
const FRAME_GROUND = "#08080c";

/** JPEG quality for a re-cut picture: kept high so small text stays crisp. */
export const SLIDE_FRAME_QUALITY = 0.92;

/** How close a picture's shape has to be to the frame before it is left alone.
    Wide enough for a finished landscape the office composed themselves (the
    Clinical Concert landscape is ~2.8% off 4:3): near-landscape passes through
    byte for byte, and the slide's cover fill takes up the sliver. */
const SHAPE_TOLERANCE = 0.04;

/** A picture that is bigger than this (in pixels) is re-cut even if its shape is right. */
const SIZE_TOLERANCE = 1.02;

type Picture = HTMLImageElement | ImageBitmap;

function size(pic: Picture): { w: number; h: number } {
  const w = (pic as HTMLImageElement).naturalWidth || pic.width || 0;
  const h = (pic as HTMLImageElement).naturalHeight || pic.height || 0;
  return { w, h };
}

/** Is this shape the frame's own, near enough to leave the picture untouched? */
export function frameShapeIsOk(aspect: number): boolean {
  return Number.isFinite(aspect) && aspect > 0 && Math.abs(aspect - SLIDE_FRAME.aspect) / SLIDE_FRAME.aspect <= SHAPE_TOLERANCE;
}

/** The picture whole and centred, as large as it goes without being cut. */
function containBox(iw: number, ih: number, W: number, H: number) {
  const s = Math.min(W / iw, H / ih);
  const w = iw * s;
  const h = ih * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/**
 * The tones of the picture's edge, zone by zone down its height: the edge
 * slice of each zone squashed into one colour, so a side band can follow the
 * poster's own colours — gold above, white where the footer runs — with no
 * streaks and no banding.
 */
function avgStrip(pic: Picture, iw: number, ih: number, x: number, y0: number, y1: number): [number, number, number] {
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const c = cv.getContext("2d");
  if (!c) return [0, 0, 0];
  const sw = Math.min(Math.max(4, Math.round(iw * 0.02)), Math.max(1, iw - x));
  const sy = Math.max(0, Math.min(ih - 1, Math.round(y0)));
  const sh = Math.max(1, Math.round(y1) - sy);
  c.clearRect(0, 0, 1, 1);
  c.drawImage(pic, x, sy, sw, Math.min(sh, ih - sy), 0, 0, 1, 1);
  const d = c.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (mx === R) h = 60 * (((G - B) / d) % 6);
  else if (mx === G) h = 60 * ((B - R) / d + 2);
  else h = 60 * ((R - G) / d + 4);
  return [(h + 360) % 360, s, l];
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function tame([r, g, b]: [number, number, number]): [number, number, number] {
  let [h, s, l] = toHsl(r, g, b);
  if (s < 0.2) {
    h = 38;
    s = 0.38;
  }
  l = Math.min(0.68, Math.max(0.24, l));
  return fromHsl(h, Math.min(0.75, s), l);
}

function shade([r, g, b]: [number, number, number], k: number): string {
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

function css([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function sideStops(pic: Picture, iw: number, ih: number, x: number): string[] {
  const top = tame(avgStrip(pic, iw, ih, x, 0, ih * 0.3));
  const mid = tame(avgStrip(pic, iw, ih, x, ih * 0.3, ih * 0.7));
  const low = tame(avgStrip(pic, iw, ih, x, ih * 0.55, ih * 0.8));
  return [shade(top, 0.88), css(mid), css(low), shade(low, 0.8)];
}

/** A tile of fine grain, so the side bands read as photograph and not paint. */
function grainTile(): HTMLCanvasElement {
  const n = 96;
  const cv = document.createElement("canvas");
  cv.width = n;
  cv.height = n;
  const c = cv.getContext("2d");
  if (c) {
    const id = c.createImageData(n, n);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 0 : 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 13;
    }
    c.putImageData(id, 0, 0);
  }
  return cv;
}

/**
 * One side band: the edge's zone tones as an upright gradient, breathed on
 * with grain and deepened toward the far edge — the reference's own look, a
 * rich golden ground darker at the rim. No blur, no feather, no lines: the
 * band is one continuous pour, and it meets the poster on the very columns
 * its tones were drawn from.
 */
function paintBand(
  ctx: CanvasRenderingContext2D,
  tones: string[],
  grain: HTMLCanvasElement,
  x: number,
  w: number,
  H: number,
  innerLeft: boolean
): void {
  if (w <= 0.5 || !tones.length) return;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  tones.forEach((t, i) => g.addColorStop(i / (tones.length - 1), t));
  ctx.fillStyle = g;
  ctx.fillRect(x, 0, w, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, 0, w, H);
  ctx.clip();
  for (let i = 0; i < 14; i++) {
    const bx = x + Math.random() * w;
    const by = Math.random() * H;
    const br = 80 + Math.random() * 200;
    const light = i % 2 === 0;
    const mg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    mg.addColorStop(0, light ? "rgba(255,226,160,0.08)" : "rgba(60,32,10,0.09)");
    mg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  for (let gy = 0; gy < H; gy += 96) {
    for (let gx = x; gx < x + w; gx += 96) ctx.drawImage(grain, gx, gy);
  }
  /* Depth toward the far edge, the way the reference falls off. */
  const v = innerLeft ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(x + w, 0, x, 0);
  v.addColorStop(0, "rgba(35,18,6,0)");
  v.addColorStop(1, "rgba(35,18,6,0.3)");
  ctx.fillStyle = v;
  ctx.fillRect(x, 0, w, H);
  ctx.restore();
}

/**
 * The room a portrait picture leaves: the poster whole and crisp, resting on
 * its own colours — like the reference. Nothing cropped, nothing blurred,
 * nothing feathered, no lines: one ground, poured edge to edge behind it.
 */
function paintSideFill(
  ctx: CanvasRenderingContext2D,
  pic: Picture,
  iw: number,
  ih: number,
  dx: number,
  W: number,
  H: number
): void {
  if (dx <= 0.5) return;
  const grain = grainTile();
  paintBand(ctx, sideStops(pic, iw, ih, 0), grain, 0, dx, H, true);
  paintBand(ctx, sideStops(pic, iw, ih, Math.max(0, iw - Math.max(4, Math.round(iw * 0.02)))), grain, W - dx, dx, H, false);
}

/**
 * Set a picture into the frame: the whole of it, centred, every pixel of it
 * untouched — never cropped, never repainted, no blur. The room a portrait
 * picture leaves at the sides is poured full with the picture's own colours
 * (see `paintSideFill`), so a portrait flyer lands in the landscape frame
 * looking like the reference: the poster whole and clear on its own golden
 * ground.
 */
const EDGE_BLEND = 24;

function blendedDraw(
  ctx: CanvasRenderingContext2D,
  pic: Picture,
  box: { x: number; y: number; w: number; h: number }
): void {
  const fx = box.x > 0.5 ? EDGE_BLEND : 0;
  const fy = box.y > 0.5 ? EDGE_BLEND : 0;
  if (!fx && !fy) {
    ctx.drawImage(pic, box.x, box.y, box.w, box.h);
    return;
  }
  try {
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.round(box.w + fx * 2));
    off.height = Math.max(1, Math.round(box.h + fy * 2));
    const o = off.getContext("2d");
    if (!o) throw 0;
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    o.drawImage(pic, fx, fy, box.w, box.h);
    o.globalCompositeOperation = "destination-in";
    if (fx) {
      const g = o.createLinearGradient(0, 0, off.width, 0);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(fx / off.width, "rgba(0,0,0,1)");
      g.addColorStop(1 - fx / off.width, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      o.fillStyle = g;
      o.fillRect(0, 0, off.width, off.height);
    }
    if (fy) {
      const g = o.createLinearGradient(0, 0, 0, off.height);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(fy / off.height, "rgba(0,0,0,1)");
      g.addColorStop(1 - fy / off.height, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      o.fillStyle = g;
      o.fillRect(0, 0, off.width, off.height);
    }
    ctx.drawImage(off, box.x - fx, box.y - fy);
  } catch {
    ctx.drawImage(pic, box.x, box.y, box.w, box.h);
  }
}

export function paintSlideFrame(
  ctx: CanvasRenderingContext2D,
  pic: Picture,
  width: number = SLIDE_FRAME.width,
  height: number = SLIDE_FRAME.height
): void {
  const { w: iw, h: ih } = size(pic);
  ctx.save();
  if (iw > 0 && ih > 0) {
    const box = containBox(iw, ih, width, height);
    paintSideFill(ctx, pic, iw, ih, box.x, width, height);
    blendedDraw(ctx, pic, box);
  }
  ctx.restore();
}

/** A fresh canvas holding the picture in the frame. */
function frameCanvas(pic: Picture, width: number, height: number): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  paintSlideFrame(ctx, pic, width, height);
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Cut a picture the office is uploading to the frame. A picture that is
 * already the frame's landscape shape and size is handed back untouched —
 * byte for byte, nothing re-encoded. Anything else is set into the frame
 * whole (see `paintSlideFrame`): the entire picture centred and exactly as
 * it was, resting on a ground of its own colours at the sides — no blur.
 * Hands back the original on any
 * failure, so an upload is never lost to a re-cut that went wrong.
 */
export async function frameImageBlob(source: Blob, quality: number = SLIDE_FRAME_QUALITY): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(source);
    if (
      frameShapeIsOk(bitmap.width / bitmap.height) &&
      bitmap.width <= SLIDE_FRAME.width * SIZE_TOLERANCE &&
      bitmap.height <= SLIDE_FRAME.height * SIZE_TOLERANCE
    ) {
      bitmap.close?.();
      return source;
    }
    const canvas = frameCanvas(bitmap, SLIDE_FRAME.width, SLIDE_FRAME.height);
    const out = canvas ? await canvasBlob(canvas, quality) : null;
    bitmap.close?.();
    return out || source;
  } catch {
    return source;
  }
}

/**
 * Fetch a pasted picture address as a Blob, for fitting it to the slide frame
 * in the drawer. Reads through perchance's proxy first (a pasted address
 * rarely sends CORS headers, so a plain fetch is usually refused), then a
 * plain fetch for the cases the proxy cannot read. Null when the address
 * cannot be read or is not a picture — the caller keeps the original address.
 */
export async function fetchPastedPicture(url: string): Promise<Blob | null> {
  const clean = String(url || "").trim();
  if (!clean) return null;
  /* A local preview address (blob:/data:) reads directly — no proxy needed. */
  if (/^(blob|data):/i.test(clean)) {
    try {
      const res = await fetch(clean);
      if (!res || (res as Response).ok === false) return null;
      const blob = await (res as Response).blob();
      if (blob && blob.size > 0 && (!blob.type || /^image\//i.test(blob.type))) return blob;
    } catch {
      /* fall through to null */
    }
    return null;
  }
  if (!/^https?:\/\//i.test(clean)) return null;
  const attempts: (() => Promise<Response>)[] = [];
  try {
    const proxy = (window as any)?.root?.superFetch;
    if (typeof proxy === "function") attempts.push(() => proxy(clean));
  } catch {
    /* no window (a worker, a test): plain fetch below */
  }
  attempts.push(() => fetch(clean));
  for (const run of attempts) {
    try {
      const res = await run();
      if (!res || (res as Response).ok === false) continue;
      const type = String((res as Response).headers?.get?.("content-type") || "");
      if (type && !/^image\//i.test(type.split(";")[0].trim())) continue;
      const blob = await (res as Response).blob();
      if (blob && blob.size > 0 && (!blob.type || /^image\//i.test(blob.type))) return blob;
    } catch {
      /* try the next way of reading it */
    }
  }
  return null;
}

/**
 * Cut a pasted picture address to the frame, for the drawer's *Fit to the
 * slide* action. Null when the address cannot be read or is not a picture —
 * the field keeps the original address, which the display path still cuts as
 * it is shown (see `framedImageUrl`).
 */
export async function framePastedSlide(url: string, quality: number = SLIDE_FRAME_QUALITY): Promise<Blob | null> {
  const blob = await fetchPastedPicture(url);
  if (!blob) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    if (
      frameShapeIsOk(bitmap.width / bitmap.height) &&
      bitmap.width <= SLIDE_FRAME.width * SIZE_TOLERANCE &&
      bitmap.height <= SLIDE_FRAME.height * SIZE_TOLERANCE
    ) {
      bitmap.close?.();
      return blob;
    }
    const canvas = frameCanvas(bitmap, SLIDE_FRAME.width, SLIDE_FRAME.height);
    const out = canvas ? await canvasBlob(canvas, quality) : null;
    bitmap.close?.();
    return out;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- pictures already on the site */

const framed = new Map<string, string>();
const cutting = new Map<string, Promise<string>>();

/** The address of the framed picture, or the original if it has not been cut. */
export function framedImageSync(url: string): string {
  const clean = String(url || "").trim();
  return framed.get(clean) || clean;
}

/**
 * A picture in the frame, for a slide showing one that is not the frame's shape
 * — an address the office pasted, or a picture uploaded before the frame
 * existed. Cut once, then remembered for the session; a failure hands back the
 * original address, so a slide never goes missing.
 */
export function framedImageUrl(url: string): Promise<string> {
  const clean = String(url || "").trim();
  if (!clean) return Promise.resolve("");
  const done = framed.get(clean);
  if (done) return Promise.resolve(done);
  const running = cutting.get(clean);
  if (running) return running;
  const run = (async () => {
    try {
      const pic = await loadPicture(clean);
      const { w: iw, h: ih } = size(pic);
      if (!iw || !ih || (frameShapeIsOk(iw / ih) && iw <= SLIDE_FRAME.width * SIZE_TOLERANCE)) {
        framed.set(clean, clean);
        return clean;
      }
      const canvas = frameCanvas(pic, SLIDE_FRAME.width, SLIDE_FRAME.height);
      const blob = canvas ? await canvasBlob(canvas, SLIDE_FRAME_QUALITY) : null;
      const address = blob ? URL.createObjectURL(blob) : clean;
      framed.set(clean, address);
      return address;
    } catch {
      return clean;
    } finally {
      cutting.delete(clean);
    }
  })();
  cutting.set(clean, run);
  return run;
}

/* A small handle for the browser console (and for future sessions):
   `window.__slideFrame.fit(blob)` is what an upload does to a picture,
   `window.__slideFrame.fitUrl(url)` what *Fit to the slide* does to a pasted
   address, `window.__slideFrame.cut(url)` shows one that is already on the site
   in the frame, and `window.__slideFrame.all()` everything cut so far. */
try {
  (window as any).__slideFrame = {
    frame: SLIDE_FRAME,
    fit: frameImageBlob,
    fitUrl: framePastedSlide,
    cut: framedImageUrl,
    cached: framedImageSync,
    all: () => new Map(framed),
  };
} catch {
  /* no window (a worker, a test): nothing to hang the handle on */
}
