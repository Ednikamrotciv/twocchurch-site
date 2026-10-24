/* Announcement slides as a rotating 4-sided stage. The four faces walk through
   every announcement on their own (note 227) — past four, the faces turn over
   to the next ones. Faces without a picture carry the church logo; with no
   slides at all the stage is all logo. Flat swiper fallback in ./slides.tsx. */

import { useEffect, useMemo, useRef, useState } from "react";
import { tx, currentLang, useI18nTick, i18nTickN } from "../lib/i18n";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei/core/Sparkles";
import { SLIDE_FRAME } from "../lib/slideFrame";
import { isSlideVideoUrl } from "../data/slides";
import { LOGO_MARK } from "../data/site";
import { siteFile } from "../lib/livefeed";
import type { AnnouncementSlide as SlideT } from "../data/slides";

export const FACE_W = 760;
export const FACE_H = Math.round(FACE_W / SLIDE_FRAME.aspect);
const BOX_W = FACE_W / 100;
const BOX_H = FACE_H / 100;
const BOX_D = BOX_W;
const SIDE_ASPECT = BOX_W / BOX_H;
const CAP_ASPECT = 1;

const FOV = 32;
const CAM_POS: [number, number, number] = [0, 0.5, 11];
const TAN_HALF = Math.tan((FOV * Math.PI) / 360);

/** The desktop page-zoom factor (see usePageZoomVar in ./slides): read off
    <html> so every stage shares one base. One value, two uses — sharper face
    paint and a sharper canvas while zoomed. */
function usePageZoomFactor(): number {
  const [zoom, setZoom] = useState(() => {
    try {
      const raw = window.getComputedStyle(document.documentElement).getPropertyValue("--page-zoom");
      const z = parseFloat(raw);
      if (isFinite(z) && z > 0) return Math.min(3, Math.max(0.5, z));
    } catch {}
    return 1;
  });
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.getComputedStyle(document.documentElement).getPropertyValue("--page-zoom");
        const z = parseFloat(raw);
        setZoom(isFinite(z) && z > 0 ? Math.min(3, Math.max(0.5, z)) : 1);
      } catch {}
    };
    read();
    window.addEventListener("resize", read);
    try {
      window.visualViewport?.addEventListener("resize", read);
    } catch {}
    return () => {
      window.removeEventListener("resize", read);
      try {
        window.visualViewport?.removeEventListener("resize", read);
      } catch {}
    };
  }, []);
  return zoom;
}

export type CuboidApi = {
  /** One face-step around the ring (swipe sideways, arrows and keys). */
  push: (dir: 1 | -1) => void;
  /** Settle onto the nearest face and hold still (a tap on the box). */
  snap: () => void;
  /** Any action around the box: stop/hold and restart the 3-minute clock. */
  poke: () => void;
};

const TURN_SPEED = (Math.PI * 2) / 26;
/** Hands off the box this long and rotation resumes: 3 quiet minutes. The
    face display itself never waits — it turns over every 15s, even on a
    tapped (held-still) box, so all uploads keep showing. */
const IDLE_MS = 3 * 60 * 1000;
/* Note 280: the rotation itself runs free whenever the box is not held — no
   timer drives it. The 15s rhythm (flat fallback's ADVANCE_MS) only rotates
   WHICH uploads sit on the four faces, one step at a time, so every upload
   displays in turn. A tap holds the revolve but the slide display keeps
   changing every 15s underneath; three quiet minutes spin the box back. */
const CONTENT_MS = 15000;

/* The four sides in the order the arrows walk them: front → right → back →
   left. Every step is a short quarter-turn of level yaw, and every resting
   face reads upright — no top or bottom faces, so words can never tip. */
function ringQuats(): THREE.Quaternion[] {
  const P = Math.PI;
  const ax = (x: number, y: number, z: number, a: number) =>
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), a);
  return [
    new THREE.Quaternion(), // front
    ax(0, 1, 0, -P / 2), // right
    ax(0, 1, 0, P), // back
    ax(0, 1, 0, P / 2), // left
  ];
}

const UP_Y = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------ painted faces */

/** One face's content: its slide (words included), its picture, its shape. */
export type FaceSlot = { slide: SlideT | null; url: string; aspect: number };

/** Wrap text to the width, at most maxLines (last line takes an ellipsis). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? line + " " + w : w;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) {
        line = "";
        break;
      }
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && (words.join(" ").length > lines.join(" ").length)) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/…?$/, "…");
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Where a film's thumbnail is picked: a few seconds in (3–10s), where the
    film has started — never the first frame, which is black on most uploads.
    Short films fall back to their middle. */
function thumbTime(dur: number): number {
  if (!isFinite(dur) || dur <= 0) return 5;
  if (dur >= 10.5) return 5;
  if (dur >= 3.5) return Math.max(3, dur - 0.5);
  if (dur > 0.7) return dur / 2;
  return Math.max(0.05, dur * 0.5);
}

/** Dark ground + picture (or logo) for one face. A film sits whole instead —
    contained on the dark, like an upload in its frame, so nothing crops off. */
function drawPhotoLayer(
  ctx: CanvasRenderingContext2D,
  photo: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null,
  videoSlot: boolean,
  logoOnly: boolean,
  W: number,
  H: number
) {
  ctx.fillStyle = "#14121a";
  ctx.fillRect(0, 0, W, H);
  if (photo && !logoOnly) {
    const iw =
      (photo as HTMLImageElement).naturalWidth ||
      (photo as HTMLVideoElement).videoWidth ||
      (photo as HTMLCanvasElement).width ||
      0;
    const ih =
      (photo as HTMLImageElement).naturalHeight ||
      (photo as HTMLVideoElement).videoHeight ||
      (photo as HTMLCanvasElement).height ||
      0;
    const ia = iw / Math.max(1, ih);
    const fa = W / H;
    let dw = W;
    let dh = H;
    if (videoSlot) {
      if (ia > fa) dh = W / ia;
      else dw = H * ia;
    } else if (ia > fa) dw = H * ia;
    else dh = W / ia;
    ctx.drawImage(photo, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else if (photo) {
    /* The logo, contained and centred. */
    const s = Math.min(W, H) * 0.62;
    ctx.drawImage(photo, (W - s) / 2, (H - s) / 2, s, s);
  }
}

/**
 * A film's words as a transparent sheet laid over its moving picture (plus
 * the play mark while no still could be read). Mirrors the words half of
 * drawFace — change one, change the other.
 */
function paintWordsSheet(
  slide: SlideT | null,
  showGlyph: boolean,
  W: number,
  H: number
): HTMLCanvasElement | null {
  const headline = tx(String(slide?.headline || "").trim());
  const line = tx(String(slide?.line || "").trim());
  const cta = tx(String(slide?.cta || "").trim());
  const link = String(slide?.link || "").trim();
  const wordless = !headline && !line && !(cta && link);
  if (wordless && !showGlyph) return null;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  if (showGlyph && !wordless) {
    /* No still could be read — a play mark over the dark, words below. */
    const cx = W / 2;
    const cy = H * 0.32;
    const r = W * 0.075;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(232,189,98,0.92)";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.28, cy - r * 0.42);
    ctx.lineTo(cx + r * 0.5, cy);
    ctx.lineTo(cx - r * 0.28, cy + r * 0.42);
    ctx.closePath();
    ctx.fillStyle = "#14121a";
    ctx.fill();
  }
  if (wordless) return cv;

  /* Legibility scrim, words over it. */
  const scrim = ctx.createLinearGradient(0, H * 0.34, 0, H);
  scrim.addColorStop(0, "rgba(5,5,10,0)");
  scrim.addColorStop(1, "rgba(5,5,10,0.88)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  const pad = W * 0.08;
  const maxW = W - pad * 2;
  ctx.textBaseline = "alphabetic";
  let y = H - pad;
  /* The button pill, drawn from the bottom up (visual only — a tap holds). */
  if (cta && link) {
    ctx.font = `600 ${Math.round(W * 0.032)}px system-ui, -apple-system, sans-serif`;
    const label = (cta || "Read more").toUpperCase();
    const tw = ctx.measureText(label).width;
    const pw = tw + W * 0.07;
    const ph = W * 0.062;
    y -= ph;
    ctx.fillStyle = "rgba(200,32,47,0.85)";
    roundRect(ctx, pad, y, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, pad + W * 0.035, y + ph * 0.68);
    y -= H * 0.035;
  }
  if (line) {
    ctx.font = `400 ${Math.round(W * 0.034)}px system-ui, -apple-system, sans-serif`;
    const lines = wrapLines(ctx, line, maxW, 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = lines.length - 1; i >= 0; i--) {
      y -= W * 0.012;
      ctx.fillText(lines[i], pad, y);
      y -= W * 0.042;
    }
  }
  if (headline) {
    ctx.font = `700 ${Math.round(W * 0.068)}px Georgia, 'Times New Roman', serif`;
    const lines = wrapLines(ctx, headline, maxW, 3);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = W * 0.02;
    for (let i = lines.length - 1; i >= 0; i--) {
      y -= W * 0.014;
      ctx.fillText(lines[i], pad, y);
      y -= W * 0.08;
    }
    ctx.shadowBlur = 0;
  }
  /* A gold rule ties the words to the picture. */
  ctx.fillStyle = "#e8bd62";
  ctx.fillRect(pad, H - pad - W * 0.008, W * 0.12, Math.max(2, W * 0.008));
  return cv;
}

/**
 * Paint one box face: the full-bleed picture with the slide's own headline,
 * line and button words set on it — the same content the flat stage shows,
 * drawn upright so it can never lie on its side. A face with no picture
 * carries the logo; a face with no words is the picture alone. A film plays
 * on the box while it turns (muted, no controls anywhere near it) — this
 * paints its resting face from its thumbnail, and the live loop in
 * useFaceTextures keeps the picture current under an identical words sheet.
 */
function drawFace(slot: FaceSlot, photo: HTMLImageElement | HTMLVideoElement | null, W: number, H: number, logoUrl: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  const slide = slot.slide;
  /* Painted in the visitor's own language, like the flat stage's words. */
  const headline = tx(String(slide?.headline || "").trim());
  const line = tx(String(slide?.line || "").trim());
  const cta = tx(String(slide?.cta || "").trim());
  const link = String(slide?.link || "").trim();
  const wordless = !headline && !line && !(cta && link);
  const videoSlot = isSlideVideoUrl(slot.url) && slot.url !== logoUrl;
  const logoOnly = (!photo && !videoSlot) || slot.url === logoUrl;

  drawPhotoLayer(ctx, photo, videoSlot, logoOnly, W, H);
  if (videoSlot && !photo && !wordless) {
    /* No still could be read — a play mark over the dark, words below. */
    const cx = W / 2;
    const cy = H * 0.32;
    const r = W * 0.075;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(232,189,98,0.92)";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.28, cy - r * 0.42);
    ctx.lineTo(cx + r * 0.5, cy);
    ctx.lineTo(cx - r * 0.28, cy + r * 0.42);
    ctx.closePath();
    ctx.fillStyle = "#14121a";
    ctx.fill();
  }
  if (wordless || logoOnly) return cv;

  /* Legibility scrim, words over it. */
  const scrim = ctx.createLinearGradient(0, H * 0.34, 0, H);
  scrim.addColorStop(0, "rgba(5,5,10,0)");
  scrim.addColorStop(1, "rgba(5,5,10,0.88)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  const pad = W * 0.08;
  const maxW = W - pad * 2;
  ctx.textBaseline = "alphabetic";
  let y = H - pad;
  /* The button pill, drawn from the bottom up (visual only — a tap holds). */
  if (cta && link) {
    ctx.font = `600 ${Math.round(W * 0.032)}px system-ui, -apple-system, sans-serif`;
    const label = (cta || "Read more").toUpperCase();
    const tw = ctx.measureText(label).width;
    const pw = tw + W * 0.07;
    const ph = W * 0.062;
    y -= ph;
    ctx.fillStyle = "rgba(200,32,47,0.85)";
    roundRect(ctx, pad, y, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, pad + W * 0.035, y + ph * 0.68);
    y -= H * 0.035;
  }
  if (line) {
    ctx.font = `400 ${Math.round(W * 0.034)}px system-ui, -apple-system, sans-serif`;
    const lines = wrapLines(ctx, line, maxW, 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = lines.length - 1; i >= 0; i--) {
      y -= W * 0.012;
      ctx.fillText(lines[i], pad, y);
      y -= W * 0.042;
    }
  }
  if (headline) {
    ctx.font = `700 ${Math.round(W * 0.068)}px Georgia, 'Times New Roman', serif`;
    const lines = wrapLines(ctx, headline, maxW, 3);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = W * 0.02;
    for (let i = lines.length - 1; i >= 0; i--) {
      y -= W * 0.014;
      ctx.fillText(lines[i], pad, y);
      y -= W * 0.08;
    }
    ctx.shadowBlur = 0;
  }
  /* A gold rule ties the words to the picture. */
  ctx.fillStyle = "#e8bd62";
  ctx.fillRect(pad, H - pad - W * 0.008, W * 0.12, Math.max(2, W * 0.008));
  return cv;
}

/**
 * Every face painted with its slide's own content. A tainted picture (one the
 * browser will not share with WebGL) falls back to words on dark — the face
 * still reads, never blanks. Film faces play while the box turns: silently
 * (muted loops, no controls), composited under an identical words sheet, so
 * a face is never a black blank — thumbnail first, live picture when it flows.
 */
function useFaceTextures(
  slots: FaceSlot[],
  logoUrl: string
): { textures: (THREE.Texture | null)[]; playBoxFilms: () => void } {
  const [textures, setTextures] = useState<(THREE.Texture | null)[]>(() => slots.map(() => null));
  /* Taps and turns restart the muted faces (and unlock them where the browser
     holds autoplay until the first touch). */
  const liveRef = useRef<() => void>(() => {});
  /* A zoomed box stretches its faces bigger — paint them denser so the words
     stay sharp instead of stretching. */
  const pageZoom = usePageZoomFactor();
  /* The visitor's language is part of the key: choosing one repaints every
     face with translated words (the table fills progressively underneath). */
  useI18nTick();
  const key = currentLang() + "#" + i18nTickN() + "|z" + pageZoom.toFixed(2) + "|" + slots.map((s) => [s.url, s.aspect, s.slide?.headline || "", s.slide?.line || "", s.slide?.cta || "", s.slide?.link || ""].join("|")).join("~");
  /* Seamless turnover (note 240): the new set of faces paints fully offscreen
     first, then swaps in with ONE state update — the old faces stay up until
     the last new one is ready, so a slide change never flashes or stalls the
     revolve. The replaced textures are freed after the swap (never while they
     are still showing); unmount frees whatever is left. */
  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    const films: HTMLVideoElement[] = [];
    const tryPlay = (v: HTMLVideoElement) => {
      try {
        const p = v.play() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {}
    };
    const kick = () => {
      films.forEach(tryPlay);
    };
    const onVis = () => {
      try {
        if (!document.hidden) kick();
      } catch {}
    };
    /* Faces showing a film keep its element here, pointed at its thumbnail —
       the resting paint below reads the still off it, and the live loop after
       the swap keeps the picture moving under the same words. */
    const filmEls: { slot: FaceSlot; video: HTMLVideoElement }[] = [];
    const load = (slot: FaceSlot): Promise<HTMLImageElement | HTMLVideoElement | null> =>
      new Promise((resolve) => {
        if (!slot.url) {
          resolve(null);
          return;
        }
        if (isSlideVideoUrl(slot.url)) {
          /* The film's thumbnail, picked a few seconds in (3–10s) where the
             film has started — then the element stays on, playing silently on
             the box while it turns. Muted and looping, so it costs no audio
             and never runs out. */
          const video = document.createElement("video");
          let done = false;
          const timer = window.setTimeout(() => {
            if (done) return;
            /* A host that will not seek still gives its current frame — a
               thumbnail from anywhere beats a black face. */
            try {
              if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
                done = true;
                window.clearTimeout(timer);
                if (alive) filmEls.push({ slot, video });
                resolve(video);
              } else {
                done = true;
                window.clearTimeout(timer);
                resolve(null);
              }
            } catch {
              done = true;
              window.clearTimeout(timer);
              resolve(null);
            }
          }, 8000);
          const finish = (el: HTMLVideoElement | null) => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            if (el && alive) filmEls.push({ slot, video });
            if (el && !alive) {
              try {
                video.removeAttribute("src");
                video.load();
              } catch {}
            }
            resolve(el);
          };
          video.muted = true;
          try {
            (video as unknown as { defaultMuted?: boolean }).defaultMuted = true;
          } catch {}
          try {
            video.volume = 0;
          } catch {}
          video.loop = true;
          try {
            (video as unknown as { playsInline?: boolean }).playsInline = true;
          } catch {}
          video.preload = "auto";
          video.crossOrigin = "anonymous";
          video.onerror = () => finish(null);
          video.onloadedmetadata = () => {
            try {
              video.currentTime = thumbTime(video.duration);
            } catch {
              finish(video.readyState >= 2 ? video : null);
            }
          };
          video.onseeked = () => finish(video.readyState >= 2 ? video : null);
          try {
            video.src = slot.url;
          } catch {
            finish(null);
          }
          return;
        }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = slot.url;
      });
    (async () => {
      const photos = await Promise.all(slots.map(load));
      if (!alive) return;
      const painted = slots.map((slot, i) => {
        const W = Math.round((slot.aspect > 1.2 ? 1024 : 768) * Math.min(2.5, Math.max(1, pageZoom)));
        const H = Math.round(W / slot.aspect);
        let cv = drawFace(slot, photos[i], W, H, logoUrl);
        let tainted = false;
        try {
          /* A tainted canvas throws here — re-paint without the picture. */
          cv.getContext("2d")?.getImageData(0, 0, 1, 1);
        } catch {
          tainted = true;
          cv = drawFace(slot, null, W, H, logoUrl);
        }
        return { slot, cv, W, H, tainted };
      });
      if (!alive) return;
      const next = painted.map((p) => {
        const tex = new THREE.CanvasTexture(p.cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return tex;
      });
      if (!alive) {
        next.forEach((t) => t.dispose());
        return;
      }
      setTextures((prev) => {
        prev.forEach((t) => t?.dispose());
        return next;
      });
      /* Films play on the box while it turns — silently, under an identical
         words sheet. The resting face above already shows the thumbnail, so
         the picture only ever changes from a still into motion, never into
         black. A face whose pixels will not share (tainted) keeps its
         words-on-dark rest and never joins the loop. */
      painted.forEach((p, i) => {
        if (p.tainted) return;
        const found = filmEls.find((f) => f.slot === p.slot);
        const v = found ? found.video : null;
        if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return;
        const slide = p.slot.slide;
        const wordless =
          !tx(String(slide?.headline || "").trim()) &&
          !tx(String(slide?.line || "").trim()) &&
          !(tx(String(slide?.cta || "").trim()) && String(slide?.link || "").trim());
        const sheet = wordless ? null : paintWordsSheet(slide, false, p.W, p.H);
        const dctx = p.cv.getContext("2d");
        if (!dctx) return;
        films.push(v);
        tryPlay(v);
        let tries = 0;
        const timer = window.setInterval(() => {
          if (!alive) return;
          try {
            if (v.paused && tries < 40) {
              tries++;
              tryPlay(v);
            }
            if (v.readyState >= 2) {
              drawPhotoLayer(dctx, v, true, false, p.W, p.H);
              if (sheet) dctx.drawImage(sheet, 0, 0);
              next[i].needsUpdate = true;
            }
          } catch {
            /* Tainted or lost mid-turn — stop the loop and leave the resting
               face up. It read a real still, so it never blanks. */
            window.clearInterval(timer);
          }
        }, 100);
        timers.push(timer);
      });
      liveRef.current = kick;
      window.addEventListener("pointerdown", kick);
      document.addEventListener("visibilitychange", onVis);
    })();
    return () => {
      alive = false;
      liveRef.current = () => {};
      timers.forEach((t) => window.clearInterval(t));
      try {
        window.removeEventListener("pointerdown", kick);
      } catch {}
      try {
        document.removeEventListener("visibilitychange", onVis);
      } catch {}
      films.forEach((v) => {
        try {
          v.pause();
        } catch {}
        try {
          v.removeAttribute("src");
          v.load();
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(
    () => () => {
      setTextures((prev) => {
        prev.forEach((t) => t?.dispose());
        return prev;
      });
    },
    []
  );
  return {
    textures,
    playBoxFilms: () => {
      try {
        liveRef.current();
      } catch {}
    },
  };
}

function Cuboid({ slides, apiRef, held, logo, theme }: { slides: (SlideT | null)[]; apiRef?: { current: CuboidApi | null }; held?: boolean; logo: string; theme: string }) {
  const group = useRef<THREE.Group>(null);
  /* One quaternion eased towards its target every frame: the default revolve
     walks a slow yaw, hands-on snaps to the ring — no separate animation. */
  const RING = useMemo(ringQuats, []);
  const qCur = useRef(new THREE.Quaternion());
  const qTarget = useRef(new THREE.Quaternion());
  const autoYaw = useRef(0);
  const ringPos = useRef(0);
  /* A tap holds the revolve; every tap starts a fresh 15s wait, after which
     the head-on face slides visibly to the next image (see the turnover
     below) — and goes on like that until the next tap. */
  const manual = useRef(false);
  const lastAct = useRef(0);
  /* Fresh 15s for the turnover after a hover hold ends (held freezes it). */
  const nextAdvance = useRef(0);
  const touch = () => {
    manual.current = true;
    lastAct.current = performance.now();
    /* The tap's own 15s: the head-on face waits this long, then slides. */
    nextAdvance.current = performance.now() + CONTENT_MS;
    /* A tap also restarts the muted faces (and unlocks them where the
       browser holds autoplay until the first touch). */
    try {
      fxRef.current.playBoxFilms();
    } catch {}
  };
  const step = (dir: 1 | -1) => {
    touch();
    ringPos.current = (ringPos.current + dir + RING.length) % RING.length;
  };
  const settle = () => {
    /* A tap or click holds the nearest face head-on instead of jumping a full
       step: the box only turns the short remainder, so taps never hiccup.
       After a 15s wait the head-on face slides to the next image, every 15s;
       three quiet minutes resume the revolve where the turn landed. */
    try {
      const q = qCur.current;
      const yaw = 2 * Math.atan2(q.y, q.w);
      const detents = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
      let best = 0;
      let bestDist = Infinity;
      detents.forEach((d, i) => {
        let dist = Math.abs(yaw - d) % (Math.PI * 2);
        if (dist > Math.PI) dist = Math.PI * 2 - dist;
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      ringPos.current = best;
    } catch {
      ringPos.current = (ringPos.current + 1) % RING.length;
    }
    touch();
  };
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { push: step, snap: settle, poke: touch };
  }, [apiRef]);
  /* All uploads take turns on the four faces. With four or fewer every face
     is steady (each slide has its own face). With more, one hidden face at a
     time turns over to the longest-unseen upload every 15s, so new slides
     ride in from the back with the revolve's own flow and nothing visible
     ever pops. A tap holds the revolve — but the head-on face still slides
     to the next image every 15s (one face-step per wait), going on like that
     until three quiet minutes hand the box back to the revolve. A hold
     (hover, focus, touch) freezes it all too, like the flat stage, with a
     fresh 15s after. */
  const countSlides = slides.length;
  const [faceIdx, setFaceIdx] = useState<number[]>([0, 1, 2, 3]);
  const faceIdxRef = useRef<number[]>([0, 1, 2, 3]);
  faceIdxRef.current = faceIdx;
  /* Next upload to bring in: always one not currently on any face. */
  const nextRef = useRef(4);
  useEffect(() => {
    if (countSlides <= 0) return;
    setFaceIdx((prev) => {
      const clamped = prev.map((v) => ((v % countSlides) + countSlides) % countSlides);
      /* Four or fewer: each slide owns a face, steady — no turnover needed. */
      if (countSlides <= 4) {
        const steady = [0, 1, 2, 3].map((f) => f % countSlides);
        nextRef.current = countSlides;
        return steady;
      }
      nextRef.current = 4;
      return clamped;
    });
  }, [countSlides]);
  const heldRef = useRef(held);
  heldRef.current = held;
  const faceSlides = useMemo(() => faceIdx.map((si) => (countSlides > 0 ? slides[((si % countSlides) + countSlides) % countSlides] : null)), [slides, countSlides, faceIdx]);
  /* Any hold around the box counts as action: it pushes the 3-minute clock
     and the 15s rhythm out, so hovering a held box keeps it held. */
  useEffect(() => {
    if (held) {
      lastAct.current = performance.now();
      nextAdvance.current = performance.now() + CONTENT_MS;
    }
  }, [held]);
  useEffect(() => {
    if (countSlides <= 0) return;
    nextAdvance.current = performance.now() + CONTENT_MS;
    const id = window.setInterval(() => {
      const now = performance.now();
      /* Hover-hold freezes the display (fresh 15s after); a tap-hold leaves
         the 15s stepping running so the head-on face keeps sliding. */
      if (heldRef.current) {
        nextAdvance.current = now + CONTENT_MS;
        return;
      }
      if (now < nextAdvance.current) return;
      nextAdvance.current = now + CONTENT_MS;
      if (manual.current) {
        /* The tapped box has waited its 15s: turn one face-step so the
           head-on face slides visibly to the next image. Every further 15s
           without activity turns it again, until three quiet minutes resume
           the revolve (see useFrame). */
        ringPos.current = (ringPos.current + 1) % RING.length;
      }
      /* Four or fewer slides already own every face — steady, only the tapped
         stepping above moves between them. */
      if (countSlides <= 4) return;
      /* Which face is most hidden right now (world dot toward camera is
         smallest): swap only that one, so the change is never visible. */
      let hidden = 2;
      try {
        const q = qCur.current;
        const yaw = 2 * Math.atan2(q.y, q.w);
        const dots = [Math.cos(yaw), -Math.sin(yaw), -Math.cos(yaw), Math.sin(yaw)];
        hidden = 0;
        for (let k = 1; k < 4; k++) if (dots[k] < dots[hidden]) hidden = k;
      } catch {}
      const onFaces = new Set(faceIdxRef.current.map((v) => ((v % countSlides) + countSlides) % countSlides));
      let next = nextRef.current;
      for (let guard = 0; guard < countSlides + 4; guard++) {
        const cand = ((next % countSlides) + countSlides) % countSlides;
        if (!onFaces.has(cand)) {
          next = cand;
          break;
        }
        next += 1;
      }
      nextRef.current = next + 1;
      setFaceIdx((prev) => {
        const faces = prev.slice();
        faces[hidden] = ((next % countSlides) + countSlides) % countSlides;
        return faces;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [countSlides]);
  /* The four sides carry the slides' own content (box material order is
     +x, -x, +y, -y, +z, -z: the caps get no slide and stay plain dark).
     A face with no picture of its own carries the church logo — the stage
     never shows a blank face, and with no slides at all it is all logo.
     Each face is painted with its slide's own words, the same content the
     flat stage shows. */
  const slots: FaceSlot[] = useMemo(() => {
    const faces = [faceSlides[1], faceSlides[3], null, null, faceSlides[0], faceSlides[2]];
    const urls = faces.map((f) => {
      const u = f?.image;
      return u && String(u).trim() ? String(u) : logo;
    });
    const aspects = [SIDE_ASPECT, SIDE_ASPECT, CAP_ASPECT, CAP_ASPECT, SIDE_ASPECT, SIDE_ASPECT];
    return urls.map((url, i) => ({ slide: faces[i], url, aspect: aspects[i] }));
  }, [faceSlides, logo]);
  const faceFx = useFaceTextures(slots, logo);
  const textures = faceFx.textures;
  const fxRef = useRef(faceFx);
  useEffect(() => {
    fxRef.current = faceFx;
  });
  const blank = theme === "light" ? "#d8cdb4" : "#15131d";
  const mats = useMemo(
    () => [0, 1, 2, 3, 4, 5].map(() => new THREE.MeshStandardMaterial({ color: blank, roughness: 0.9, metalness: 0.05 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme]
  );
  useEffect(() => {
    textures.forEach((tex, i) => {
      const m = mats[i];
      if (!m) return;
      if (tex) {
        m.map = tex;
        m.color.set("#ffffff");
        m.roughness = 0.62;
        m.metalness = 0.08;
      } else {
        m.map = null;
        m.color.set(blank);
        m.roughness = 0.9;
        m.metalness = 0.05;
      }
      m.needsUpdate = true;
    });
  }, [textures, mats, blank]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(({ clock }, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const delta = Math.min(rawDelta, 0.05);
    if (manual.current && performance.now() - lastAct.current > IDLE_MS) {
      /* Three quiet minutes: pick the revolve up where the turn landed. The
         slide display never stopped (15s turnover throughout), so its clock
         is untouched. */
      const q = qCur.current;
      autoYaw.current = 2 * Math.atan2(q.y, q.w);
      manual.current = false;
    }
    if (manual.current) {
      qTarget.current.copy(RING[ringPos.current]);
    } else if (!held) {
      /* The default: a slow, level revolve — yaw only, so words never tip. */
      autoYaw.current -= TURN_SPEED * delta;
      qTarget.current.setFromAxisAngle(UP_Y, autoYaw.current);
    }
    const a = 1 - Math.exp(-(manual.current ? 7 : 2.2) * delta);
    qCur.current.slerp(qTarget.current, a);
    g.quaternion.copy(qCur.current);
    /* Hands-on the box sits truly still; revolving it bobs gently as before. */
    const bobT = manual.current || held ? 0 : Math.sin(clock.elapsedTime * 0.8) * 0.08;
    g.position.y = THREE.MathUtils.damp(g.position.y, bobT, 3, delta);
  });
  return (
    <group ref={group}>
      <mesh material={mats} onClick={settle}>
        <boxGeometry args={[BOX_W, BOX_H, BOX_D]} />
      </mesh>
    </group>
  );
}

function CuboidFit({ children }: { children: React.ReactNode }) {
  const { size } = useThree();
  const ref = useRef<any>(null);
  const target = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    const visH = 2 * CAM_POS[2] * TAN_HALF;
    const visW = visH * aspect;
    const diag = Math.sqrt(BOX_W * BOX_W + BOX_D * BOX_D);
    return Math.min(visW / (diag + 2.6), visH / (BOX_H + 3.4)) * 0.95;
  }, [size]);
  useFrame((_, rawDelta) => {
    const g = ref.current;
    if (!g) return;
    const s = THREE.MathUtils.damp(g.scale.x, target, 3.0, Math.min(rawDelta, 0.05));
    g.scale.set(s, s, s);
  });
  return <group ref={ref} scale={target}>{children}</group>;
}

function CameraRig() {
  useFrame(({ clock, camera, pointer }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = clock.elapsedTime;
    const px = pointer.x * 0.7 + Math.sin(t * 0.3) * 0.15;
    const ty = 0.5 + pointer.y * 0.35 + Math.cos(t * 0.23) * 0.08;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, px, 2.2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, ty, 2.2, delta);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function CuboidSpace3D({ slides, apiRef, held }: { slides: SlideT[]; apiRef?: { current: CuboidApi | null }; held?: boolean }) {
  /* The stage light follows the page theme, and the canvas stays transparent
     so the box revolves against the light or dark page background itself. */
  const [theme, setTheme] = useState(() => {
    try {
      return document.documentElement.getAttribute("data-theme") || "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    const ob = new MutationObserver(() => {
      try {
        setTheme(document.documentElement.getAttribute("data-theme") || "dark");
      } catch {
        /* the stage keeps its light */
      }
    });
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => ob.disconnect();
  }, []);
  const light = theme === "light";
  const logo = useMemo(() => siteFile(LOGO_MARK), []);
  /* A zoomed box shows its faces bigger — let the canvas render denser too. */
  const pageZoom = usePageZoomFactor();
  return (
    <div className="aslides__gl">
      <Canvas
        dpr={[1, Math.min(3, 1.75 * Math.max(1, pageZoom))]}
        camera={{ fov: FOV, position: CAM_POS }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={light ? 1.25 : 0.95} />
        <directionalLight position={[5, 7, 8]} intensity={light ? 1.35 : 1.15} />
        <directionalLight position={[-6, -2, 4]} intensity={0.3} color="#e8bd62" />
        <CameraRig />
        <Sparkles count={42} scale={[15, 7, 4]} position={[0, 0, -3.5]} size={2.4} speed={0.22} opacity={0.5} color="#e8c37a" />
        <CuboidFit>
          <Cuboid slides={slides} apiRef={apiRef} held={held} logo={logo} theme={theme} />
        </CuboidFit>
      </Canvas>
    </div>
  );
}
