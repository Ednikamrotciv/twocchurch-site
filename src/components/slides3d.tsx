/* Announcement slides as a rotating 3D cuboid. Past six, the faces carry the first six.
   Flat swiper fallback in ./slides.tsx. */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei/core/Sparkles";
import { SLIDE_FRAME } from "../lib/slideFrame";
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
const REST_TILT = 0.14;

export type CuboidApi = { push: (dir: 1 | -1) => void };

const TURN_SPEED = (Math.PI * 2) / 26;
const PUSH_SPEED = 2.8;

function useFaceTextures(urls: string[], aspects: number[]): (THREE.Texture | null)[] {
  const [textures, setTextures] = useState<(THREE.Texture | null)[]>(() => urls.map(() => null));
  useEffect(() => {
    let alive = true;
    const made: THREE.Texture[] = [];
    urls.forEach((url, i) => {
      if (!url) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (!alive) return;
        const tex = new THREE.Texture(img);
        const ia = img.naturalWidth / Math.max(1, img.naturalHeight);
        const a = aspects[i] || 1;
        let rx = 1;
        let ry = 1;
        let ox = 0;
        let oy = 0;
        if (ia > a) {
          rx = a / ia;
          ox = (1 - rx) / 2;
        } else if (ia < a) {
          ry = ia / a;
          oy = (1 - ry) / 2;
        }
        tex.repeat.set(rx, ry);
        tex.offset.set(ox, oy);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        made.push(tex);
        setTextures((prev) => {
          const next = prev.slice();
          next[i] = tex;
          return next;
        });
      };
      img.onerror = () => {};
      img.src = url;
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join("|"), aspects.join(",")]);
  return textures;
}

function Cuboid({ slides, apiRef, held }: { slides: SlideT[]; apiRef?: { current: CuboidApi | null }; held?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const kick = useRef(0);
  const speed = useRef(0);
  const phase = useRef(0);
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      push: (dir) => {
        kick.current += dir * PUSH_SPEED;
      },
    };
  }, [apiRef]);
  const n = Math.max(1, slides.length);
  const faceSlides = useMemo(() => [0, 1, 2, 3, 4, 5].map((f) => slides[f % n]), [slides, n]);
  const slotUrls = useMemo(() => [faceSlides[1].image, faceSlides[3].image, faceSlides[4].image, faceSlides[5].image, faceSlides[0].image, faceSlides[2].image], [faceSlides]);
  const slotAspects = useMemo(() => [SIDE_ASPECT, SIDE_ASPECT, CAP_ASPECT, CAP_ASPECT, SIDE_ASPECT, SIDE_ASPECT], []);
  const textures = useFaceTextures(slotUrls, slotAspects);
  const mats = useMemo(
    () => [0, 1, 2, 3, 4, 5].map(() => new THREE.MeshStandardMaterial({ color: "#15131d", roughness: 0.9, metalness: 0.05 })),
    []
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
        m.color.set("#15131d");
        m.roughness = 0.9;
        m.metalness = 0.05;
      }
      m.needsUpdate = true;
    });
  }, [textures, mats]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(({ clock }, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const delta = Math.min(rawDelta, 0.05);
    kick.current = THREE.MathUtils.damp(kick.current, 0, 1.8, delta);
    speed.current = THREE.MathUtils.damp(speed.current, held ? 0 : TURN_SPEED, 1.6, delta);
    /* Side to side around Y, while the tip wanders with the turn — diagonally
       and up and down, so every face leans into view in turn. Everything runs
       off one phase, so a hold freezes the whole tumble together. */
    const w = speed.current + kick.current;
    g.rotation.y -= w * delta;
    phase.current += w * delta;
    const t = phase.current;
    g.rotation.x = REST_TILT + Math.sin(t * 0.35) * 0.5;
    g.rotation.z = Math.sin(t * 0.23 + 1.3) * 0.18;
    g.position.y = Math.sin(clock.elapsedTime * 0.8) * 0.08;
  });
  return (
    <group ref={group} rotation={[REST_TILT, 0, 0]}>
      <mesh material={mats} onClick={() => { kick.current += PUSH_SPEED; }}>
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

export function CuboidSpace3D({ slides, apiRef, held }: { slides: SlideT[]; apiRef?: { current: CuboidApi | null }; held?: boolean }) {
  return (
    <div className="aslides__gl">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: FOV, position: CAM_POS }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={0.95} />
        <directionalLight position={[5, 7, 8]} intensity={1.15} />
        <directionalLight position={[-6, -2, 4]} intensity={0.3} color="#e8bd62" />
        <CameraRig />
        <Sparkles count={42} scale={[15, 7, 4]} position={[0, 0, -3.5]} size={2.4} speed={0.22} opacity={0.5} color="#e8c37a" />
        <CuboidFit>
          <Cuboid slides={slides} apiRef={apiRef} held={held} />
        </CuboidFit>
      </Canvas>
    </div>
  );
}
