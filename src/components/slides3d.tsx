/* Announcement slides as a rotating 3D cuboid. Past six, the faces carry the first six.
   Faces without a picture carry the church logo; with no slides at all the box
   is all logo. Flat swiper fallback in ./slides.tsx. */

import { useEffect, useMemo, useRef, useState } from "react";
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
  /** One face-step around the ring (swipe sideways, side zones and keys). */
  push: (dir: 1 | -1) => void;
  /** Straight to a ring face (the dots under the stage). */
  goTo: (i: number) => void;
  /** Settle onto the nearest face and hold still (a tap on the box). */
  snap: () => void;
};

const TURN_SPEED = (Math.PI * 2) / 26;
/** Hands off the box this long and it resumes its default slow revolve. */
const IDLE_MS = 3 * 60 * 1000;

/* The six faces in the order the side zones walk them. Every step is a short
   turn (90–120°) and every resting face reads upright — the caps carry an
   extra half-turn about the viewing axis, without which their words would lie
   on their side (all six verified numerically: normal to the lens, top edge up). */
function ringQuats(): THREE.Quaternion[] {
  const P = Math.PI;
  const ax = (x: number, y: number, z: number, a: number) =>
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), a);
  return [
    new THREE.Quaternion(), // front
    ax(0, 1, 0, -P / 2), // right
    ax(0, 0, 1, P).multiply(ax(1, 0, 0, P / 2)), // top, upright
    ax(0, 1, 0, P), // back
    ax(0, 0, 1, P).multiply(ax(1, 0, 0, -P / 2)), // bottom, upright
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
  const headline = String(slide?.headline || "").trim();
  const line = String(slide?.line || "").trim();
  const cta = String(slide?.cta || "").trim();
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
  const key = slots.map((s) => [s.url, s.aspect, s.slide?.headline || "", s.slide?.line || "", s.slide?.cta || "", s.slide?.link || ""].join("|")).join("~");
  useEffect(() => {
    let alive = true;
    const made: THREE.Texture[] = [];
    const paint = (slot: FaceSlot, i: number, photo: HTMLImageElement | null) => {
      if (!alive) return;
      const W = slot.aspect > 1.2 ? 1024 : 768;
      const H = Math.round(W / slot.aspect);
      let cv = drawFace(slot, photo, W, H, logoUrl);
      try {
        /* A tainted canvas throws here — re-paint without the picture. */
        cv.getContext("2d")?.getImageData(0, 0, 1, 1);
      } catch {
        cv = drawFace(slot, null, W, H, logoUrl);
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      made.push(tex);
      setTextures((prev) => {
        const next = prev.slice();
        next[i] = tex;
        return next;
      });
    };
    slots.forEach((slot, i) => {
      if (!slot.url) {
        paint(slot, i, null);
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => paint(slot, i, img);
      img.onerror = () => paint(slot, i, null);
      img.src = slot.url;
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return textures;
}

function Cuboid({ slides, apiRef, held, logo, theme, onFace }: { slides: (SlideT | null)[]; apiRef?: { current: CuboidApi | null }; held?: boolean; logo: string; theme: string; onFace?: (i: number) => void }) {
  const group = useRef<THREE.Group>(null);
  /* One quaternion eased towards its target every frame: the default revolve
     walks a slow yaw, hands-on snaps to the ring — no separate animation. */
  const RING = useMemo(ringQuats, []);
  const qCur = useRef(new THREE.Quaternion());
  const qTarget = useRef(new THREE.Quaternion());
  const autoYaw = useRef(0);
  const ringPos = useRef(0);
  /* Hands-on until three quiet minutes pass, then the default revolve resumes. */
  const manual = useRef(false);
  const lastAct = useRef(0);
  const lastFace = useRef(-1);
  const onFaceRef = useRef(onFace);
  onFaceRef.current = onFace;
  const touch = () => {
    manual.current = true;
    lastAct.current = performance.now();
  };
  const step = (dir: 1 | -1) => {
    touch();
    ringPos.current = (ringPos.current + dir + RING.length) % RING.length;
  };
  const go = (i: number) => {
    touch();
    const n = RING.length;
    ringPos.current = ((Math.round(i) % n) + n) % n;
  };
  const settle = () => {
    touch();
    /* Nearest resting face — the sign-free match, since q and -q turn alike. */
    let best = 0;
    let bestDot = -2;
    RING.forEach((q, i) => {
      const d = Math.abs(qCur.current.dot(q));
      if (d > bestDot) {
        bestDot = d;
        best = i;
      }
    });
    ringPos.current = best;
  };
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { push: step, goTo: go, snap: settle };
  }, [apiRef]);
  const faceSlides = useMemo(() => [0, 1, 2, 3, 4, 5].map((f) => (slides.length ? slides[f % slides.length] : null)), [slides]);
  /* A face with no picture of its own carries the church logo — the box never
     shows a blank face, and with no slides at all it is all logo. Each face is
     painted with its slide's own words, the same content the flat stage shows. */
  const slots: FaceSlot[] = useMemo(() => {
    const urls = [faceSlides[1]?.image, faceSlides[3]?.image, faceSlides[4]?.image, faceSlides[5]?.image, faceSlides[0]?.image, faceSlides[2]?.image]
      .map((u) => (u && String(u).trim() ? String(u) : logo));
    const aspects = [SIDE_ASPECT, SIDE_ASPECT, CAP_ASPECT, CAP_ASPECT, SIDE_ASPECT, SIDE_ASPECT];
    const faces = [faceSlides[1], faceSlides[3], faceSlides[4], faceSlides[5], faceSlides[0], faceSlides[2]];
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
    if (manual.current && performance.now() - lastAct.current > IDLE_MS) manual.current = false;
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
    /* Report the face on show (nearest ring rest), so the dots keep up. */
    if (onFaceRef.current) {
      let best = 0;
      let bestDot = -2;
      RING.forEach((q, i) => {
        const d = Math.abs(qCur.current.dot(q));
        if (d > bestDot) {
          bestDot = d;
          best = i;
        }
      });
      if (best !== lastFace.current) {
        lastFace.current = best;
        onFaceRef.current(best);
      }
    }
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
    const tx = pointer.x * 0.7 + Math.sin(t * 0.3) * 0.15;
    const ty = 0.5 + pointer.y * 0.35 + Math.cos(t * 0.23) * 0.08;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, tx, 2.2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, ty, 2.2, delta);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function CuboidSpace3D({ slides, apiRef, held, onFace }: { slides: SlideT[]; apiRef?: { current: CuboidApi | null }; held?: boolean; onFace?: (i: number) => void }) {
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
          <Cuboid slides={slides} apiRef={apiRef} held={held} logo={logo} theme={theme} onFace={onFace} />
        </CuboidFit>
      </Canvas>
    </div>
  );
}
