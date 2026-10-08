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

export type CuboidApi = {
  /** One face-step around the ring (swipe sideways, arrows and keys). */
  push: (dir: 1 | -1) => void;
  /** Settle onto the nearest face and hold still (a tap on the box). */
  snap: () => void;
  /** Any action around the box: stop/hold and restart the 3-minute clock. */
  poke: () => void;
};

const TURN_SPEED = (Math.PI * 2) / 26;
/** Hands off the box this long and it resumes its default slow revolve. */
const IDLE_MS = 3 * 60 * 1000;
/* Note 275: the 15s slide rhythm lives on the flat fallback only (ADVANCE_MS
   in ./slides.tsx). The box itself just revolves whenever it is not held —
   no timed face turnover here. */

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

/**
 * Paint one box face: the full-bleed picture with the slide's own headline,
 * line and button words set on it — the same content the flat stage shows,
 * drawn upright so it can never lie on its side. A face with no picture
 * carries the logo; a face with no words is the picture alone.
 */
function drawFace(slot: FaceSlot, photo: HTMLImageElement | null, W: number, H: number, logoUrl: string): HTMLCanvasElement {
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
  const logoOnly = !photo || slot.url === logoUrl;

  ctx.fillStyle = "#14121a";
  ctx.fillRect(0, 0, W, H);
  if (photo && !logoOnly) {
    /* Cover the face with the picture. */
    const ia = photo.naturalWidth / Math.max(1, photo.naturalHeight);
    const fa = W / H;
    let dw = W;
    let dh = H;
    if (ia > fa) dw = H * ia;
    else dh = W / ia;
    ctx.drawImage(photo, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else if (photo) {
    /* The logo, contained and centred. */
    const s = Math.min(W, H) * 0.62;
    ctx.drawImage(photo, (W - s) / 2, (H - s) / 2, s, s);
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
 * still reads, never blanks.
 */
function useFaceTextures(slots: FaceSlot[], logoUrl: string): (THREE.Texture | null)[] {
  const [textures, setTextures] = useState<(THREE.Texture | null)[]>(() => slots.map(() => null));
  /* The visitor's language is part of the key: choosing one repaints every
     face with translated words (the table fills progressively underneath). */
  useI18nTick();
  const key = currentLang() + "#" + i18nTickN() + "|" + slots.map((s) => [s.url, s.aspect, s.slide?.headline || "", s.slide?.line || "", s.slide?.cta || "", s.slide?.link || ""].join("|")).join("~");
  /* Seamless turnover (note 240): the new set of faces paints fully offscreen
     first, then swaps in with ONE state update — the old faces stay up until
     the last new one is ready, so a slide change never flashes or stalls the
     revolve. The replaced textures are freed after the swap (never while they
     are still showing); unmount frees whatever is left. */
  useEffect(() => {
    let alive = true;
    const load = (slot: FaceSlot): Promise<HTMLImageElement | null> =>
      new Promise((resolve) => {
        if (!slot.url) {
          resolve(null);
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
      const next = slots.map((slot, i) => {
        const W = slot.aspect > 1.2 ? 1024 : 768;
        const H = Math.round(W / slot.aspect);
        let cv = drawFace(slot, photos[i], W, H, logoUrl);
        try {
          /* A tainted canvas throws here — re-paint without the picture. */
          cv.getContext("2d")?.getImageData(0, 0, 1, 1);
        } catch {
          cv = drawFace(slot, null, W, H, logoUrl);
        }
        const tex = new THREE.CanvasTexture(cv);
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
    })();
    return () => {
      alive = false;
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
  return textures;
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
  /* Hands-on until three quiet minutes pass, then the default revolve resumes
     (note 275: revolve only — the 15s rhythm is flat-fallback only). */
  const manual = useRef(false);
  const lastAct = useRef(0);
  const touch = () => {
    manual.current = true;
    lastAct.current = performance.now();
  };
  const step = (dir: 1 | -1) => {
    touch();
    ringPos.current = (ringPos.current + dir + RING.length) % RING.length;
  };
  const settle = () => {
    /* A tap or click stops on a face and stays there: no auto handover.
       Three quiet minutes resume the revolve where the turn lands. */
    ringPos.current = (ringPos.current + 1) % RING.length;
    touch();
  };
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { push: step, snap: settle, poke: touch };
  }, [apiRef]);
  /* Fixed faces: the box shows the first four announcements (logo where a
     face has no picture). It revolves whenever it is not tapped/held — no
     timed turnover; the 15s change is the flat fallback's only. */
  const countSlides = slides.length;
  const faceSlides = useMemo(() => [0, 1, 2, 3].map((f) => (countSlides > 0 ? slides[f % countSlides] : null)), [slides, countSlides]);
  /* Any hold around the box counts as action: it pushes the 3-minute clock
     out, so hovering a held box keeps it held. */
  useEffect(() => {
    if (held) lastAct.current = performance.now();
  }, [held]);
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
  const textures = useFaceTextures(slots, logo);
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
      /* Three quiet minutes: pick the revolve up where the turn landed. */
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
  return (
    <div className="aslides__gl">
      <Canvas
        dpr={[1, 1.75]}
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
