/* Slide frame 1600x1200: posters set in whole (never cropped) on their own colours. Never throws. */

import { loadPicture } from "./palette";

/** The frame every announcement slide is cut to: 1600×1200 — the house 4:3. */
export const SLIDE_FRAME = { aspect: 4 / 3, width: 1600, height: 1200 } as const;

/** The ground the frame is laid on before the picture's own colours go down. */
const FRAME_GROUND = "#08080c";

/** JPEG quality for a re-cut picture: kept high so small text stays crisp. */
export const SLIDE_FRAME_QUALITY = 0.92;

/** Near-frame shapes pass through untouched. */
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

/** Edge tones per height zone, for the side bands. */
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

/** One side band: zone tones as a grainy upright gradient, deepened outward. */
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

/** Portrait room: poster whole on its own colours, edge to edge. */
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

/** Set a picture into the frame: whole, centred, untouched; sides poured with its own colours. */
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

/** Cut an uploaded picture to the frame (frame-shaped ones pass through; original back on failure). */
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

/** Fetch a pasted picture address as a Blob (proxy first, then plain fetch). */
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
  try {
    const res = await fetch(clean);
    if (!res || (res as Response).ok === false) return null;
    const type = String((res as Response).headers?.get?.("content-type") || "");
    if (type && !/^image\//i.test(type.split(";")[0].trim())) return null;
    const blob = await (res as Response).blob();
    if (blob && blob.size > 0 && (!blob.type || /^image\//i.test(blob.type))) return blob;
  } catch {
    /* unreadable there — the office can upload the picture instead */
  }
  return null;
}

/** Cut a pasted picture address to the frame, for *Fit to the slide*. */
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

/** Set an already-loaded picture (a canvas, a bitmap, a video still) into the
    frame — whole, centred, sides poured with its own colours — as an address.
    "" back when it cannot be cut (callers fall back to the source itself). */
export async function frameLoadedPicture(pic: Picture, quality: number = SLIDE_FRAME_QUALITY): Promise<string> {
  try {
    const canvas = frameCanvas(pic, SLIDE_FRAME.width, SLIDE_FRAME.height);
    const blob = canvas ? await canvasBlob(canvas, quality) : null;
    return blob ? URL.createObjectURL(blob) : "";
  } catch {
    return "";
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

/** A sited picture in the frame. Cut once per session; original back on failure. */
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

/* Console handle: `__slideFrame.fit/fitUrl/cut/all()`. */
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
