/* ============================================================================
   The colours of a picture.

   A slide is not a template with a picture dropped into it: it takes its
   colours from the picture the office uploaded, so a red flyer and a blue one
   read as two different posters rather than the same poster twice. This module
   samples the picture on a canvas, works out its strongest colour together with
   its dark ground and its paper, and hands back a palette that is *guaranteed*
   to stay readable — every text/ground pair is checked against WCAG contrast
   and nudged until it passes, so a very pale or a very dark picture still gets
   words you can read on it.

   Reading a picture's pixels needs the picture to be same-origin or to allow
   CORS. The bundled photographs are same-origin and perchance's upload host
   answers with `Access-Control-Allow-Origin`, so `crossOrigin = "anonymous"`
   works for both; anything else falls back to `FALLBACK_PALETTE`, which is the
   poster palette the designs shipped with — an unreadable picture still gets a
   finished slide.

   The same sampling answers two questions about the *composition*: which side
   of the picture is quietest (`calm` — where a design may put its words without
   covering the subject) and where the busiest part is (`focusX`/`focusY`, used
   as the crop's `object-position` so the subject survives the crop).

   The picture's *shape* is not read here: every slide is cut to the one frame
   in `src/lib/slideFrame.ts` (SPEC note 122), so this module is about colour
   alone.
   ========================================================================== */

export type CalmSide = "left" | "right" | "top" | "bottom";

export type SlidePalette = {
  /** The slide's ground: the picture's own hue, taken down to near-black. */
  ink: string;
  /** A lifted ground, for the gradients. */
  inkTop: string;
  /** The picture's strongest colour, lifted until it reads on `ink`. */
  accent: string;
  /** A pale wash of the same colour. */
  accent2: string;
  /** A deep, saturated fill of it — the designs' scarlet. */
  deep: string;
  /** The paper: the accent's hue taken up to near-white. */
  light: string;
  light2: string;
  onInk: string;
  onInkSoft: string;
  onLight: string;
  onLightSoft: string;
  onAccent: string;
  calm: CalmSide;
  focusX: number;
  focusY: number;
  fromImage: boolean;
};

/** The poster palette the designs were drawn in — used until (or instead of) a read. */
export const FALLBACK_PALETTE: SlidePalette = {
  ink: "#0a0a0e",
  inkTop: "#221d31",
  accent: "#e8bd62",
  accent2: "#f8e3ad",
  deep: "#c8202f",
  light: "#f2e8d5",
  light2: "#fffaf0",
  onInk: "#f7f1e4",
  onInkSoft: "#cbc2ae",
  onLight: "#191510",
  onLightSoft: "#5f5847",
  onAccent: "#ffffff",
  calm: "right",
  focusX: 50,
  focusY: 42,
  fromImage: false,
};

type Hsl = { h: number; s: number; l: number };
type Rgb = { r: number; g: number; b: number };

const SAMPLE_W = 64;
const SAMPLE_MAX_H = 96;
const HUE_BUCKETS = 24;
const CACHE_VERSION = 2;
const CACHE_KEY = "wom.slidePalette";
const CACHE_MAX = 60;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = 60 * (((G - B) / d) % 6);
  else if (max === G) h = 60 * ((B - R) / d + 2);
  else h = 60 * ((R - G) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function hex({ r, g, b }: Rgb): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Move a colour's lightness away from the ground until it reads on it — and
 * stop at the ends, so the palette is always a real colour rather than a clip.
 */
function readable(fg: Hsl, ground: Rgb, target: number): Rgb {
  const step = luminance(ground) > 0.4 ? -0.025 : 0.025;
  let l = fg.l;
  let out = hslToRgb({ ...fg, l });
  for (let i = 0; i < 48 && contrast(out, ground) < target; i++) {
    const next = clamp(l + step, 0.02, 0.99);
    if (next === l) break;
    l = next;
    out = hslToRgb({ ...fg, l });
  }
  return out;
}

/* ------------------------------------------------------------------- reading */

function readPalette(px: Uint8ClampedArray, w: number, h: number): SlidePalette | null {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ weight: 0, sat: 0, lum: 0 }));
  const energy = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let count = 0;
  let satSum = 0;
  const row = new Float32Array(w);
  const prevRow = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 128) {
        row[x] = -1;
        continue;
      }
      const { h: hue, s, l } = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      count++;
      satSum += s;
      /* Weight a hue by how *vivid* the pixel is: a saturated mid-tone says
         more about a picture's colour than a near-black or near-white one. */
      const vivid = s * s * (1 - Math.abs(2 * l - 1) * 0.55);
      const bucket = buckets[Math.min(HUE_BUCKETS - 1, Math.floor((hue / 360) * HUE_BUCKETS))];
      bucket.weight += vivid;
      bucket.sat += s * vivid;
      bucket.lum += l * vivid;
      const cell = Math.min(2, Math.floor((x / w) * 3)) + 3 * Math.min(2, Math.floor((y / h) * 3));
      const left = x > 0 ? row[x - 1] : -1;
      const up = y > 0 ? prevRow[x] : -1;
      if (left >= 0) energy[cell] += Math.abs(l - left);
      if (up >= 0) energy[cell] += Math.abs(l - up);
      row[x] = l;
    }
    prevRow.set(row);
  }
  if (count < 16) return null;

  /* The picture's own colour: the vivid-weighted average of the winning hue and
     its two neighbours, so a picture that straddles a bucket boundary is not
     read as the boundary. */
  let best = 0;
  for (let i = 1; i < HUE_BUCKETS; i++) if (buckets[i].weight > buckets[best].weight) best = i;
  let hueSin = 0;
  let hueCos = 0;
  for (let d = -2; d <= 2; d++) {
    const b = buckets[(best + d + HUE_BUCKETS) % HUE_BUCKETS];
    if (!b.weight) continue;
    const mid = (((best + d + HUE_BUCKETS) % HUE_BUCKETS) + 0.5) / HUE_BUCKETS;
    const rad = mid * Math.PI * 2;
    hueSin += Math.sin(rad) * b.weight;
    hueCos += Math.cos(rad) * b.weight;
  }
  const hue = ((Math.atan2(hueSin, hueCos) / (Math.PI * 2)) * 360 + 360) % 360;
  const winner = buckets[best];
  /* How colourful the picture really is, measured on the colour that stood out
     rather than on every pixel — a white flyer with a red headline is a red
     poster, and this is what says so. */
  const accentSat = winner.weight > 0 ? winner.sat / winner.weight : satSum / count;
  const meanSat = satSum / count;
  const colour = accentSat > 0.22 && meanSat > 0.06;
  const baseSat = colour ? clamp(accentSat * 1.15, 0.3, 0.85) : 0.05;
  /* A picture with no colour of its own — a black-and-white flyer — keeps a
     neutral palette rather than being given a colour it never had. */
  const tone = (saturation: number, neutral: number) => (colour ? saturation : neutral);

  const ink = hslToRgb({ h: hue, s: tone(clamp(baseSat * 0.5, 0.06, 0.34), 0.03), l: 0.085 });
  const inkTop = hslToRgb({ h: hue, s: tone(clamp(baseSat * 0.58, 0.08, 0.4), 0.04), l: 0.17 });
  const light = hslToRgb({ h: hue, s: tone(clamp(baseSat * 0.3, 0.05, 0.26), 0.02), l: 0.94 });
  const light2 = hslToRgb({ h: hue, s: tone(clamp(baseSat * 0.34, 0.06, 0.3), 0.02), l: 0.98 });
  const accent = readable({ h: hue, s: tone(clamp(baseSat + 0.08, 0.3, 0.9), 0.02), l: 0.72 }, ink, 4.6);
  const accent2 = readable({ h: hue, s: tone(clamp(baseSat * 0.75, 0.2, 0.7), 0.02), l: 0.88 }, ink, 7);
  const deep = readable({ h: hue, s: tone(clamp(baseSat + 0.1, 0.35, 0.9), 0.03), l: 0.36 }, { r: 255, g: 255, b: 255 }, 4.6);
  const onInk = readable({ h: hue, s: tone(0.22, 0.02), l: 0.97 }, ink, 7);
  const onInkSoft = readable({ h: hue, s: tone(0.2, 0.02), l: 0.74 }, ink, 4.8);
  const onLight = readable({ h: hue, s: tone(0.4, 0.02), l: 0.13 }, light, 7);
  const onLightSoft = readable({ h: hue, s: tone(0.3, 0.02), l: 0.34 }, light, 4.8);
  const white: Rgb = { r: 255, g: 255, b: 255 };
  const onAccent = contrast(white, accent) >= 4.6 ? white : readable({ h: hue, s: tone(0.5, 0.02), l: 0.12 }, accent, 4.6);

  /* Which side is quietest, and where the picture is busiest. */
  const side = (cells: number[]) => cells.reduce((a, c) => a + energy[c], 0) / cells.length;
  const sides: [CalmSide, number][] = [
    ["left", side([0, 3, 6])],
    ["right", side([2, 5, 8])],
    ["top", side([0, 1, 2])],
    ["bottom", side([6, 7, 8])],
  ];
  sides.sort((a, b) => a[1] - b[1]);
  let busiest = 4;
  for (let i = 0; i < 9; i++) if (energy[i] > energy[busiest]) busiest = i;

  return {
    ink: hex(ink),
    inkTop: hex(inkTop),
    accent: hex(accent),
    accent2: hex(accent2),
    deep: hex(deep),
    light: hex(light),
    light2: hex(light2),
    onInk: hex(onInk),
    onInkSoft: hex(onInkSoft),
    onLight: hex(onLight),
    onLightSoft: hex(onLightSoft),
    onAccent: hex(onAccent),
    calm: sides[0][0],
    focusX: Math.round(((busiest % 3) + 0.5) * 33.3),
    focusY: Math.round((Math.floor(busiest / 3) + 0.5) * 33.3),
    fromImage: true,
  };
}

/* ------------------------------------------------------------------ loading */

const cache = new Map<string, SlidePalette>();
const loading = new Map<string, Promise<SlidePalette>>();

function readCache(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== CACHE_VERSION || typeof parsed.items !== "object") return;
    for (const [url, value] of Object.entries(parsed.items as Record<string, SlidePalette>)) {
      if (value && typeof value === "object" && typeof value.ink === "string") cache.set(url, { ...FALLBACK_PALETTE, ...value });
    }
  } catch {
    /* no storage, or a cache from another shape: read the pictures instead */
  }
}

function writeCache(): void {
  try {
    const items: Record<string, SlidePalette> = {};
    const keys = [...cache.keys()].slice(-CACHE_MAX);
    for (const key of keys) items[key] = cache.get(key)!;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_VERSION, items }));
  } catch {
    /* storage full or refused: the palette still lives in memory */
  }
}

readCache();

/**
 * Read a picture in. CORS-friendly (`crossOrigin`), so a picture that is not
 * off this site can still be sampled — and so `slideFrame.ts` can draw one into
 * the slide frame without tainting the canvas.
 */
export function loadPicture(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    (img as any).decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("the picture could not be read"));
    img.src = url;
  });
}

/** Read a picture's colours. Resolves to `FALLBACK_PALETTE` on any failure. */
export function loadSlidePalette(url: string): Promise<SlidePalette> {
  const clean = String(url || "").trim();
  if (!clean) return Promise.resolve(FALLBACK_PALETTE);
  const cached = cache.get(clean);
  if (cached) return Promise.resolve(cached);
  const inFlight = loading.get(clean);
  if (inFlight) return inFlight;
  const run = (async () => {
    try {
      const img = await loadPicture(clean);
      const w = SAMPLE_W;
      const h = clamp(Math.round((SAMPLE_W * img.naturalHeight) / Math.max(1, img.naturalWidth)), 1, SAMPLE_MAX_H);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      /* The picture's shape is not read here: every slide is cut to the one
         frame (src/lib/slideFrame.ts, SPEC note 122), and this read is only
         about the colours the poster is drawn in. */
      const palette = readPalette(data, w, h);
      if (!palette) throw new Error("no colours");
      cache.set(clean, palette);
      writeCache();
      return palette;
    } catch {
      /* Not readable (no CORS on the host, a broken link, no canvas): the
         designs keep the palette they shipped with. Not cached, so a picture
         that comes right later is read then. */
      return FALLBACK_PALETTE;
    } finally {
      loading.delete(clean);
    }
  })();
  loading.set(clean, run);
  return run;
}

/** The palette read so far, or the shipped one while a read is in flight. */
export function paletteFor(url: string): SlidePalette {
  return cache.get(String(url || "").trim()) || FALLBACK_PALETTE;
}

/* A small handle for the browser console (and for future sessions):
   `window.__slidePalette.load(url)` reads a picture's colours, and
   `window.__slidePalette.all()` shows everything read so far. */
try {
  (window as any).__slidePalette = {
    load: loadSlidePalette,
    cached: paletteFor,
    all: () => new Map(cache),
    fallback: FALLBACK_PALETTE,
  };
} catch {
  /* no window (a worker, a test): nothing to hang the handle on */
}
