/* Announcement slides: office pictures composed into designed slides, colours sampled from each one (note 122).
   One frame for all; 3D stage with a flat fallback. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swiper from "swiper";
import { Autoplay, EffectCreative } from "swiper/modules";
import { motion } from "framer-motion";
import { Link, isPathMode, refreshRoute } from "../lib/router";
import { Icon } from "./ui";
import { photoOr } from "../data/photos";
import { useCmsVersion } from "../lib/cms";
import { ct } from "../data/copy";
import { tx } from "../lib/i18n";
import { loadSlidePalette, paletteFor, type SlidePalette } from "../lib/palette";
import { SLIDE_FRAME, framedImageSync, framedImageUrl, frameLoadedPicture } from "../lib/slideFrame";
import { SLIDES, SLIDE_DESIGNS, slideDesigns, visibleSlides, slideDesignName, isSlideVideoUrl, type AnnouncementSlide, type SlideDesign } from "../data/slides";
import { useWebGLAvailable, StageErrorBoundary } from "./stageassist";
import type { CuboidApi } from "./slides3d";

const CuboidSpace3D = React.lazy(() => import("./slides3d").then((m) => ({ default: m.CuboidSpace3D })));

/** How long a slide shows before the space moves to the next one on its own. */
const ADVANCE_MS = 15000;

/** How small the auto-fit will take a poster's words before it gives up. */
const FIT_FLOOR = 0.6;

/** Everything a design centres its words on, and the block those words sit in. */
const TEXT_SELECTOR = ".aslide__headline, .aslide__line, .aslide__action, .aslide__tag, .aslide__orn, .aslide__star, .aslide__diamond, .aslide__num";

/* ---------------------------------------------------------------------- colours */

/** The picture's colours, read once per address (poster palette until it lands).
    Videos keep the poster palette — their colours are never sampled. */
function useSlidePalette(url: string): SlidePalette {
  const video = isSlideVideoUrl(url);
  const [palette, setPalette] = useState(() => paletteFor(video ? "" : url));
  useEffect(() => {
    if (video) {
      setPalette(paletteFor(""));
      return;
    }
    let alive = true;
    const known = paletteFor(url);
    setPalette(known);
    if (!known.fromImage) {
      loadSlidePalette(url)
        .then((next) => {
          if (alive && next.fromImage) setPalette(next);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [url, video]);
  return palette;
}

/** The picture as the slide shows it: in the frame (cut in-browser when needed).
    Videos play as they are — no frame is ever cut from them. */
function useSlideFrame(url: string): string {
  const video = isSlideVideoUrl(url);
  const [src, setSrc] = useState(() => (video ? url : framedImageSync(url)));
  useEffect(() => {
    if (video) {
      setSrc(url);
      return;
    }
    let alive = true;
    const ready = framedImageSync(url);
    setSrc(ready);
    framedImageUrl(url)
      .then((next) => {
        if (alive && next) setSrc(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url, video]);
  return src;
}

/** The palette as the CSS variables every design reads. */
function paletteVars(p: SlidePalette): React.CSSProperties {
  return {
    ["--poster-ink" as any]: p.ink,
    ["--poster-ink-top" as any]: p.inkTop,
    ["--poster-accent" as any]: p.accent,
    ["--poster-accent-2" as any]: p.accent2,
    ["--poster-deep" as any]: p.deep,
    ["--poster-light" as any]: p.light,
    ["--poster-light-2" as any]: p.light2,
    ["--poster-on-ink" as any]: p.onInk,
    ["--poster-on-ink-soft" as any]: p.onInkSoft,
    ["--poster-on-light" as any]: p.onLight,
    ["--poster-on-light-soft" as any]: p.onLightSoft,
    ["--poster-on-accent" as any]: p.onAccent,
    ["--poster-focus-x" as any]: p.focusX + "%",
    ["--poster-focus-y" as any]: p.focusY + "%",
  };
}

/** A film's own still and its framed ground: one frame captured off the film,
    then treated exactly like an uploaded picture — whole in the frame, sides
    poured with its own colours — so a film fits the screen the way uploads
    do. The flat face plays the film contained over that ground, and the
    slide's colours are read off the same still. */
function useVideoFrame(url: string): { poster: string; framed: string } {
  const [frame, setFrame] = useState({ poster: "", framed: "" });
  useEffect(() => {
    setFrame({ poster: "", framed: "" });
    if (!isSlideVideoUrl(url)) return;
    let alive = true;
    let done = false;
    let ground = "";
    const video = document.createElement("video");
    const settle = (el: HTMLVideoElement | null) => {
      if (done || !alive) return;
      done = true;
      window.clearTimeout(timer);
      (async () => {
        try {
          if (!el || el.readyState < 2 || !el.videoWidth || !el.videoHeight) {
            if (alive) setFrame({ poster: "", framed: "" });
            return;
          }
          const scale = Math.min(1, 640 / el.videoWidth);
          const cv = document.createElement("canvas");
          cv.width = Math.max(2, Math.round(el.videoWidth * scale));
          cv.height = Math.max(2, Math.round(el.videoHeight * scale));
          const c = cv.getContext("2d");
          if (!c) throw 0;
          /* A tainted still (no CORS on the host) throws here — the film
             keeps the dark ground and the poster palette instead. */
          c.drawImage(el, 0, 0, cv.width, cv.height);
          const poster = cv.toDataURL("image/jpeg", 0.72);
          ground = await frameLoadedPicture(cv);
          if (alive) setFrame({ poster, framed: ground || poster });
        } catch {
          if (alive) setFrame({ poster: "", framed: "" });
        }
      })();
    };
    const timer = window.setTimeout(() => settle(null), 8000);
    video.muted = true;
    try {
      (video as unknown as { playsInline?: boolean }).playsInline = true;
    } catch {}
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.onerror = () => settle(null);
    video.onloadeddata = () => {
      try {
        video.currentTime = 0.1;
      } catch {
        settle(video.readyState >= 2 ? video : null);
      }
    };
    video.onseeked = () => settle(video.readyState >= 2 ? video : null);
    video.src = url;
    return () => {
      alive = false;
      window.clearTimeout(timer);
      try {
        video.removeAttribute("src");
        video.load();
      } catch {}
      if (ground) URL.revokeObjectURL(ground);
    };
  }, [url]);
  return frame;
}

/* --------------------------------------------------------------------- one slide */

/**
 * One announcement, composed. `index` and `total` are the slide's place in the
 * space — the *Numbered plate* design prints them.
 */
export function AnnouncementSlide({
  slide,
  design,
  index = 1,
  total = 1,
  spotlight = false,
  onVideoState,
  videoActive,
  onVideoEnded,
}: {
  slide: AnnouncementSlide;
  design: SlideDesign;
  index?: number;
  total?: number;
  /** The face currently head-on: refit its words when it turns to face out. */
  spotlight?: boolean;
  /** Flat-face films report play/pause/end so the space can hold its 15s rhythm. */
  onVideoState?: (playing: boolean, el?: HTMLVideoElement | null) => void;
  /** True while this slide sits head-on: its film plays itself, silently. */
  videoActive?: boolean;
  /** A film that ran to its end hands the rhythm on at once. */
  onVideoEnded?: () => void;
}) {
  /* A slide with no picture of its own still has to look finished: the welcome
     photo stands in until the office uploads one (see `photoOr`). */
  const original = photoOr(slide.image, "welcome");
  /* A film upload plays as it is — visitors work it with the player's own
     volume and time-range controls, flat face only (the 3D stage paints a
     still instead, see slides3d). */
  const isVideo = isSlideVideoUrl(original);
  /* Films carry their own background: the framed ground cut from the film's
     still (its own colours, like an upload), with the film played whole and
     contained over it. Until the still lands the ground stays dark. */
  const videoFrame = useVideoFrame(original);
  const videoBg = isVideo ? videoFrame.framed : "";
  /* Shown in the frame; read for its colours as it was photographed, so the
     palette is the office's own picture and not the mat the frame puts round it. */
  const photo = useSlideFrame(original);
  const palette = useSlidePalette(isVideo ? videoFrame.poster : original);
  /* The film element (picture slides render none — the ref stays empty). */
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const videoActiveRef = useRef(!!videoActive);
  videoActiveRef.current = !!videoActive;
  /* A head-on film plays itself, silently — the visitor turns the sound on
     with the player's own volume control. Anywhere else it sits still on
     its snapshot, muted, ready for its turn. */
  useEffect(() => {
    const el = videoEl.current;
    if (!el) return;
    try {
      el.muted = true;
      (el as unknown as { defaultMuted?: boolean }).defaultMuted = true;
    } catch {}
    if (videoActiveRef.current) {
      try {
        const p = el.play() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {}
    } else {
      try {
        el.pause();
      } catch {}
      try {
        el.muted = true;
      } catch {}
    }
  }, [videoActive, original]);
  /* Painted/translated with the visitor's language — every face follows it. */
  const headline = tx(String(slide.headline || "").trim());
  const line = tx(String(slide.line || "").trim());
  const link = String(slide.link || "").trim();
  const cta = tx(String(slide.cta || "").trim());

  const action = link ? (
    link.startsWith("/") ? (
      <Link className="aslide__action" to={link}>
        {cta || ct("auto.site.036376f37680ea1a")}
        <Icon name="arrowRight" size={14} />
      </Link>
    ) : (
      <a className="aslide__action" href={link} target="_blank" rel="noopener noreferrer">
        {cta || ct("auto.site.036376f37680ea1a")}
        <Icon name="external" size={13} />
      </a>
    )
  ) : null;

  const words = (
    <>
      {headline ? <h3 className="aslide__headline">{headline}</h3> : null}
      {line ? <p className="aslide__line">{line}</p> : null}
      {action}
    </>
  );

  /* The mandala the seal design draws over the picture: two rings and a ring of
     ticks, worked out once. */
  const mandalaTicks = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2;
        const r1 = 74;
        const r2 = i % 4 === 0 ? 66 : 70;
        return (
          <line
            key={i}
            x1={100 + Math.cos(a) * r1}
            y1={100 + Math.sin(a) * r1}
            x2={100 + Math.cos(a) * r2}
            y2={100 + Math.sin(a) * r2}
          />
        );
      }),
    []
  );

  /* Poster words never run off the poster: the block scales to fit (never past FIT_FLOOR). */
  const rootRef = useRef<HTMLDivElement>(null);
  const fitWords = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const blocks = Array.from(el.querySelectorAll<HTMLElement>(".aslide__words"));
    const texts = Array.from(el.querySelectorAll<HTMLElement>(TEXT_SELECTOR));
    if (!blocks.length || !texts.length) return;
    const apply = (fit: number) => el.style.setProperty("--fit", String(fit));
    const fits = () =>
      blocks.every((block) => {
        const b = block.getBoundingClientRect();
        const s = window.getComputedStyle(block);
        const top = b.top + parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth);
        const bottom = b.bottom - parseFloat(s.paddingBottom) - parseFloat(s.borderBottomWidth);
        const left = b.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth);
        const right = b.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth);
        return texts.every((t) => {
          if (!block.contains(t)) return true;
          const r = t.getBoundingClientRect();
          return r.top >= top - 1 && r.bottom <= bottom + 1 && r.left >= left - 1 && r.right <= right + 1;
        });
      });
    apply(1);
    let fit = 1;
    while (fit > FIT_FLOOR && !fits()) {
      fit = Math.max(FIT_FLOOR, fit - 0.025);
      apply(fit);
    }
  }, []);

  useEffect(() => {
    fitWords();
  }, [fitWords, design, headline, line, cta, link, photo, index, total, spotlight]);

  /* The box shape can change after the first fit — measure again when it does. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitWords());
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitWords]);

  /* The display face arrives after the first paint, and it is a different shape
     from the fallback: measure again once it is really there. */
  useEffect(() => {
    let alive = true;
    const fonts = (document as any).fonts;
    if (fonts && fonts.ready && typeof fonts.ready.then === "function") {
      fonts.ready
        .then(() => {
          if (alive) fitWords();
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [fitWords]);

  /* A slide with words missing (a picture with nothing typed yet) is shown as
     the picture itself — full-bleed, no empty panel — so it still looks
     finished while the office types. */
  const wordless = !headline && !line && !action;
  /* A film sits whole in the frame on the ground cut from its own still —
     the same fit as an upload — with its words in a compact caption across
     the top, so the player's own volume and time-range bar along the foot
     stays fully in view and touchable in every design. Taps on the film
     never count as taps on the box — the film's own play state holds the
     15s rhythm. */
  if (isVideo) {
    const report = (playing: boolean) => (e: React.SyntheticEvent<HTMLVideoElement>) => {
      e.stopPropagation();
      const el = e.currentTarget;
      if (playing) {
        try {
          const root = el.closest(".aslides__viewport") || document;
          root.querySelectorAll("video").forEach((v) => {
            if (v !== el && !v.paused) v.pause();
          });
        } catch {}
      }
      onVideoState?.(playing, el);
    };
    /* The film's first screen is its own snapshot; its end slides on at once. */
    const onEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      report(false)(e);
      if (videoActiveRef.current) {
        try {
          onVideoEnded?.();
        } catch {}
      }
    };
    return (
      <div
        ref={rootRef}
        className={"aslide aslide--" + design + " aslide--video"}
        data-design={design}
        data-calm={palette.calm}
        data-slide={slide.id || undefined}
        style={paletteVars(palette)}
      >
        {videoBg ? <img className="aslide__photo" src={videoBg} alt="" aria-hidden="true" /> : null}
        <video
          ref={videoEl}
          className="aslide__media aslide__media--fit"
          src={original}
          poster={videoFrame.poster || undefined}
          controls
          muted
          playsInline
          preload="metadata"
          onPlay={report(true)}
          onPause={report(false)}
          onEnded={onEnded}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        />
        {!wordless && (
          <>
            <span className="aslide__videotop" aria-hidden="true" />
            <div className="aslide__words aslide__videocap">{words}</div>
          </>
        )}
      </div>
    );
  }
  if (wordless) {
    return (
      <div
        className={ct("auto.site.da0952ca9a0940d3")}
        data-design={design}
        data-calm={palette.calm}
        data-slide={slide.id || undefined}
        style={paletteVars(palette)}
      >
        <img className="aslide__photo" src={photo} alt="" />
      </div>
    );
  }

  /* The picture fills the slide in every design; what changes from design to
     design is the treatment laid over it. */
  const body = () => {
    switch (design) {
      case "band":
        return (
          <>
            <img className="aslide__photo" src={photo} alt="" />
            <span className="aslide__scrim aslide__scrim--side" />
            <div className="aslide__words aslide__band">
              <span className="aslide__orn">◆</span>
              {words}
            </div>
          </>
        );

      case "arch":
        return (
          <>
            <img className="aslide__photo aslide__photo--under" src={photo} alt="" />
            <div className="aslide__arch">
              <img className="aslide__photo aslide__photo--lit" src={photo} alt="" />
            </div>
            <span className="aslide__archline" />
            <span className="aslide__scrim aslide__scrim--foot" />
            <div className="aslide__words aslide__archbody">
              <span className="aslide__star">✦</span>
              {words}
            </div>
          </>
        );

      case "rays":
        return (
          <>
            <img className="aslide__photo aslide__photo--warm" src={photo} alt="" />
            <span className="aslide__rays" />
            <span className="aslide__scrim aslide__scrim--foot" />
            <div className="aslide__words aslide__card">{words}</div>
          </>
        );

      case "seal":
        return (
          <>
            <img className="aslide__photo aslide__photo--dim" src={photo} alt="" />
            <span className="aslide__sealscrim" />
            <svg className="aslide__mandala" viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="78" />
              <circle cx="100" cy="100" r="58" />
              <circle cx="100" cy="100" r="38" />
              {mandalaTicks}
            </svg>
            <div className="aslide__words aslide__sealbody">{words}</div>
          </>
        );

      case "split":
        return (
          <>
            <img className="aslide__photo" src={photo} alt="" />
            <div className="aslide__words aslide__splitbottom">{words}</div>
          </>
        );

      case "numeral":
        return (
          <>
            <img className="aslide__photo" src={photo} alt="" />
            <span className="aslide__numveil" />
            <div className="aslide__words aslide__numcol">
              <b className="aslide__num">{String(index).padStart(2, "0")}</b>
              {words}
            </div>
          </>
        );

      case "ribbon":
        return (
          <>
            <img className="aslide__photo aslide__photo--warm" src={photo} alt="" />
            <span className="aslide__scrim aslide__scrim--foot" />
            <div className="aslide__words aslide__ribbon">{words}</div>
          </>
        );

      case "plate":
      default:
        return (
          <>
            <img className="aslide__photo" src={photo} alt="" />
            <div className="aslide__words aslide__plate">
              <span className="aslide__tag">{ct("auto.site.b3ce73b7c12e0076")}</span>
              {words}
            </div>
          </>
        );
    }
  };

  return (
    <div
      ref={rootRef}
      className={"aslide aslide--" + design}
      data-design={design}
      data-calm={palette.calm}
      data-slide={slide.id || undefined}
      style={paletteVars(palette)}
    >
      {body()}
    </div>
  );
}

/* ---------------------------------------------------------------- the space */

/** True when the visitor has asked their device for less motion. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** True for `?slides=all` anywhere in the address — the design preview. */
function showingAllDesigns(): boolean {
  try {
    return /[?&]slides=all(&|$)/.test(window.location.hash + "&" + window.location.search);
  } catch {
    return false;
  }
}

/** Take `?slides=all` back out of the address, so the preview is never a trap. */
function leaveDesignPreview() {
  const strip = (text: string, empty: string) =>
    text.replace(/[?&]slides=all(&|$)/g, (_m, tail) => (tail ? "?" : "")).replace(/[?&]$/, "") || empty;
  try {
    if (/[?&]slides=all(&|$)/.test(window.location.hash)) {
      if (isPathMode()) {
        const rest = strip(window.location.hash, "");
        const url = window.location.pathname + window.location.search + (rest && rest !== "#" ? rest : "");
        window.history.replaceState(null, "", url);
        refreshRoute();
      } else {
        window.location.hash = strip(window.location.hash, "#/");
      }
    } else {
      window.location.search = strip(window.location.search, "");
    }
  } catch {
    if (isPathMode()) window.history.replaceState(null, "", "/");
    else window.location.hash = "#/";
  }
}

export function AnnouncementSlides({ slides = SLIDES }: { slides?: AnnouncementSlide[] }) {
  const version = useCmsVersion();
  /* A slide's own last moment can pass while the page sits open — re-read the
     list on the half minute, but only when some slide carries a last day. */
  const [tick, setTick] = useState(0);
  const timed = (slides || []).some((s) => s && String(s.expiresDate || "").trim());
  useEffect(() => {
    if (!timed) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, [timed]);
  const live = useMemo(() => visibleSlides(slides), [slides, version, tick]);
  const designs = useMemo(() => slideDesigns(live), [live]);
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  heldRef.current = held;
  /* Tap/click hold: a tap stops the rotation and holds it; fifteen quiet
     seconds with no action around the box resume with a fresh 15s. */
  const [userHeld, setUserHeld] = useState(false);
  const userHeldRef = useRef(false);
  userHeldRef.current = userHeld;
  const resumeTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);
  /* A film playing on the flat face holds the 15s rhythm the same way a tap
     does — ending or pausing it lets the rhythm go immediately. */
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoPlayingRef = useRef(false);
  const onVideoState = useCallback((playing: boolean) => {
    if (playing) {
      /* A tap-hold must not outlast the film: the film owns the hold now. */
      window.clearTimeout(resumeTimer.current);
      setUserHeld(false);
      userHeldRef.current = false;
      videoPlayingRef.current = true;
      setVideoPlaying(true);
    } else {
      if (!videoPlayingRef.current) return;
      videoPlayingRef.current = false;
      setVideoPlaying(false);
    }
  }, []);
  const previewing = showingAllDesigns();
  /* Read once: flipping the OS setting mid-visit does not rebuild the stage. */
  const [calm] = useState(() => prefersReducedMotion());
  const webgl = useWebGLAvailable();
  useEffect(() => {
    if (calm || !webgl) return;
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (!ric) return;
    const id = ric(() => {
      void import("./slides3d");
    });
    return () => (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
  }, [calm, webgl]);
  /* The 3D cuboid turns itself, slowly and without steps; the arrows, swipe,
     keys or a tap just lend it speed. */
  const cuboidApi = useRef<CuboidApi | null>(null);
  const count = live.length;
  const stageRef = useRef<HTMLDivElement>(null);
  const swiperRef = useRef<Swiper | null>(null);
  /* Which slide the flat face sits on — films play themselves while head-on. */
  const [activeIdx, setActiveIdx] = useState(0);
  const push3d = (dir: 1 | -1) => {
    cuboidApi.current?.push(dir);
  };
  const snap3d = () => {
    cuboidApi.current?.snap();
  };

  /* One shape for every announcement: the slide frame (src/lib/slideFrame.ts).
     Every picture is cut to it — uploaded, pasted or already published — so the
     space is the same size whichever slide is on it, and the slides do not
     change shape under the visitor as the space turns. */
  const shapeVar = { ["--slide-aspect" as any]: String(SLIDE_FRAME.aspect) };
  /* The picture the space keeps when there are no slides at all, cut the same. */
  const standIn = useSlideFrame(photoOr("", "welcome"));

  /* Swiper owns the stage: a creative glide, a rewind at the ends, and a slow
     self-advance. The arrow keys stay on the region itself (see onKeyDown), so
     the Keyboard module is skipped; new slides are picked up by the observer
     while the office edits. */
  useEffect(() => {
    const el = stageRef.current;
    /* Desktop arrows are the swipe equivalent, so they never hide: the stage
       exists even with one slide, and the arrows stay wired to it. */
    if (!el || previewing || !count) return;
    const mark = (root: Element, active: number) => {
      root.querySelectorAll(".swiper-slide").forEach((item, i) => {
        const mine = i === active;
        item.setAttribute("aria-hidden", mine ? "false" : "true");
        (item as HTMLElement).toggleAttribute("inert", !mine);
      });
    };
    const sw = new Swiper(el, {
      modules: [Autoplay, EffectCreative],
      speed: calm ? 0 : 640,
      rewind: true,
      effect: calm ? "slide" : "creative",
      creativeEffect: {
        prev: { translate: [0, 0, -320], scale: 0.94, opacity: 0 },
        next: { translate: ["104%", 0, 0], opacity: 1 },
      },
      autoplay: calm ? false : { delay: ADVANCE_MS, disableOnInteraction: false, pauseOnMouseEnter: true },
      observer: true,
      observeParents: true,
      on: {
        slideChange(s) {
          mark(s.el, s.activeIndex);
          setActiveIdx(s.activeIndex);
          /* Films left behind stop — their pause report restarts the rhythm. */
          try {
            const items = s.el.querySelectorAll(".swiper-slide");
            s.el.querySelectorAll("video").forEach((v) => {
              const item = v.closest(".swiper-slide");
              const at = Array.prototype.indexOf.call(items, item);
              if (at !== s.activeIndex && !v.paused) v.pause();
            });
          } catch {}
        },
      },
    });
    swiperRef.current = sw;
    mark(el, sw.activeIndex);
    setActiveIdx(sw.activeIndex);
    return () => {
      swiperRef.current = null;
      sw.destroy(true, true);
    };
  }, [previewing, count, calm]);

  /* A hold (hover, focus, touch) or a tap-hold freezes swiper's own timer —
     and so does a film playing on the flat face. The moment the film ends
     (or pauses) the 15s rhythm starts again at once. */
  useEffect(() => {
    const sw = swiperRef.current;
    const timer = sw && sw.autoplay && !calm ? sw.autoplay : null;
    if (!timer) return;
    if (held || userHeld || videoPlayingRef.current) timer.stop();
    else timer.start();
  }, [held, userHeld, videoPlaying, calm]);

  /* Stop on tap/click/swipe/arrow/key; any action around the box while held
     pushes the 3-minute quiet wait (and the fresh 15s rhythm) out. */
  const holdBox = useCallback(() => {
    if (calm) return;
    setUserHeld(true);
    userHeldRef.current = true;
    try {
      (swiperRef.current?.autoplay as any)?.stop();
    } catch {}
    window.clearTimeout(resumeTimer.current);
    /* After a tap the flat face waits 15s, then slides to the next image —
       and goes on like that, every 15s, until the next tap. */
    resumeTimer.current = window.setTimeout(() => {
      setUserHeld(false);
      userHeldRef.current = false;
      try {
        const sw = swiperRef.current;
        /* The 15s wait is over: slide now (unless a hover-hold or a film
           owns the stage — those keep it still). */
        if (sw && !heldRef.current && !videoPlayingRef.current) sw.slideNext();
        const timer = sw?.autoplay as any;
        timer?.stop();
        timer?.start();
      } catch {}
    }, ADVANCE_MS);
  }, [calm]);
  const touchBox = useCallback(() => {
    if (userHeldRef.current) holdBox();
  }, [holdBox]);
  /* A film's end hands the rhythm straight on: slide at once (unless a hold
     owns the stage), then keep the 15s rhythm going behind it. */
  const advanceForVideo = useCallback(() => {
    if (calm) return;
    const sw = swiperRef.current;
    if (!sw) return;
    if (heldRef.current || userHeldRef.current) return;
    window.clearTimeout(resumeTimer.current);
    setUserHeld(false);
    userHeldRef.current = false;
    try {
      sw.slideNext();
      const timer = sw.autoplay as any;
      timer?.stop();
      timer?.start();
    } catch {}
  }, [calm]);
  /* Taps on a film's own controls are the film's business, never the box's. */
  const holdBoxFrom = useCallback(
    (target: unknown) => {
      try {
        if ((target as HTMLElement)?.closest?.("video")) return;
      } catch {}
      holdBox();
    },
    [holdBox]
  );

  const go = (step: number) => {
    const sw = swiperRef.current;
    if (!sw) return;
    holdBox();
    if (step > 0) sw.slideNext();
    else sw.slidePrev();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      touchBox();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      touchBox();
      go(1);
    }
  };

  /* Swipes go left and right only — a tap settles the box onto the nearest
     face and holds it still, and up-and-down page scrolling is untouched. */
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onKeyDown3d = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      push3d(-1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      push3d(1);
    }
  };

  if (!count) {
    /* No announcements posted: the box keeps turning with the church logo on
       every face (see slides3d) rather than going empty — in the frame too, so
       the space is the shape it will be the moment a slide arrives. */
    if (!calm && webgl) {
      return (
        <div className="aslides-wrap">
          <motion.div
            className="aslides-motion"
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.6, ease: [0.22, 0.7, 0.3, 1] }}
          >
            <div
              className="aslides aslides--3d"
              style={shapeVar}
              onKeyDown={onKeyDown3d}
              role="img"
              aria-label={ct("auto.site.ed1bc718392f9ee1")}
            >
              <StageErrorBoundary fallback={<img className="aslide__photo" src={standIn} alt="" />}>
                <React.Suspense fallback={null}>
                  <CuboidSpace3D slides={[]} apiRef={cuboidApi} held={held} />
                </React.Suspense>
              </StageErrorBoundary>
              {/* Desktop arrows never hide — they are the swipe equivalent. */}
              <motion.button
                type="button"
                className="aslides__arrow aslides__arrow--prev"
                onClick={() => push3d(-1)}
                aria-label={ct("auto.site.f719940ccc0bc69d")}
                whileTap={{ scale: 0.86 }}
              >
                <Icon name="chevronLeft" size={18} />
              </motion.button>
              <motion.button
                type="button"
                className="aslides__arrow aslides__arrow--next"
                onClick={() => push3d(1)}
                aria-label={ct("auto.site.6142ea6c0a3fdf05")}
                whileTap={{ scale: 0.86 }}
              >
                <Icon name="chevronRight" size={18} />
              </motion.button>
            </div>
          </motion.div>
        </div>
      );
    }
    return (
      <div className="aslides aslides--empty" style={shapeVar}>
        <img className="aslide__photo" src={standIn} alt="" />
      </div>
    );
  }

  if (previewing) {
    return (
      <div className="aslide-preview" style={shapeVar}>
        <div className="aslide-preview__head">
          <p className="aslide-preview__lede">{ct("auto.site.ab4deae9dc91bd70")}</p>
          <button type="button" className="aslide-preview__close" onClick={leaveDesignPreview}>
            {ct("auto.site.049e26f8954df2a1")}
          </button>
        </div>
        <div className="aslide-preview__grid">
          {SLIDE_DESIGNS.map((d) => (
            <figure className="aslide-preview__cell" key={d.id}>
              <div className="aslide-preview__frame">
                <AnnouncementSlide slide={live[0]} design={d.id} index={1} total={count} />
              </div>
              <figcaption>
                <b>{d.name}</b>
                <em>{d.blurb}</em>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  /* The moving stage is 3D when the visitor's motion setting and browser
     allow it; otherwise the flat swiper stage below. */
  if (!calm && webgl) {
    return (
      <div className="aslides-wrap">
        <motion.div
          className="aslides-motion"
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6, ease: [0.22, 0.7, 0.3, 1] }}
        >
          <div
            className="aslides aslides--3d"
            style={shapeVar}
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onFocusCapture={() => setHeld(true)}
            onBlurCapture={() => setHeld(false)}
            onKeyDown={onKeyDown3d}
            onPointerDown={() => cuboidApi.current?.poke?.()}
            onClick={() => cuboidApi.current?.poke?.()}
            onTouchStart={(e) => {
              touchStart.current = { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 };
              setHeld(true);
              cuboidApi.current?.poke?.();
            }}
            onTouchEnd={(e) => {
              const start = touchStart.current;
              touchStart.current = null;
              setHeld(false);
              if (!start) return;
              const dx = (e.changedTouches[0]?.clientX ?? start.x) - start.x;
              const dy = (e.changedTouches[0]?.clientY ?? start.y) - start.y;
              /* A tap settles the box onto the nearest face and it stays put;
                 three quiet minutes resume the default revolve (see slides3d).
                 Anything mostly up-and-down is a page scroll, left alone. */
              if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
                snap3d();
                return;
              }
              if (Math.abs(dx) >= Math.abs(dy)) {
                if (dx > 40) push3d(-1);
                else if (dx < -40) push3d(1);
                else snap3d();
              }
            }}
            onTouchCancel={() => {
              touchStart.current = null;
              setHeld(false);
            }}
            role="region"
            aria-roledescription="carousel"
            aria-label={ct("auto.site.ed1bc718392f9ee1")}
          >
            <StageErrorBoundary fallback={<img className="aslide__photo" src={standIn} alt="" />}>
              <React.Suspense fallback={null}>
                <CuboidSpace3D slides={live} apiRef={cuboidApi} held={held} />
              </React.Suspense>
            </StageErrorBoundary>
            {/* The arrows are always present on the 3D stage — desktops
                without touch need them for every turn. */}
            <motion.button
              type="button"
              className="aslides__arrow aslides__arrow--prev"
              onClick={() => push3d(-1)}
              aria-label={ct("auto.site.f719940ccc0bc69d")}
              whileTap={{ scale: 0.86 }}
            >
              <Icon name="chevronLeft" size={18} />
            </motion.button>
            <motion.button
              type="button"
              className="aslides__arrow aslides__arrow--next"
              onClick={() => push3d(1)}
              aria-label={ct("auto.site.6142ea6c0a3fdf05")}
              whileTap={{ scale: 0.86 }}
            >
              <Icon name="chevronRight" size={18} />
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="aslides-wrap">
      <motion.div
        className="aslides-motion"
        initial={{ opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.6, ease: [0.22, 0.7, 0.3, 1] }}
      >
        <div
          className="aslides"
          style={shapeVar}
          onMouseEnter={() => {
            setHeld(true);
            touchBox();
          }}
          onMouseLeave={() => setHeld(false)}
          onFocusCapture={() => {
            setHeld(true);
            touchBox();
          }}
          onBlurCapture={() => setHeld(false)}
          onKeyDown={onKeyDown}
          onPointerDown={(e) => holdBoxFrom(e.target)}
          onClick={(e) => holdBoxFrom(e.target)}
          onTouchStart={(e) => holdBoxFrom(e.target)}
          role="region"
          aria-roledescription="carousel"
          aria-label={ct("auto.site.ed1bc718392f9ee1")}
        >
          <div
            className="aslides__viewport swiper"
            ref={stageRef}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement)?.closest?.("video")) return;
              setHeld(true);
              holdBox();
            }}
            onPointerUp={() => setHeld(false)}
            onPointerCancel={() => setHeld(false)}
          >
            <div className="swiper-wrapper">
              {live.map((s, i) => (
                <div className="swiper-slide" key={s.id || i}>
                  <AnnouncementSlide
                    slide={s}
                    design={designs[i] || "plate"}
                    index={i + 1}
                    total={count}
                    onVideoState={onVideoState}
                    videoActive={i === activeIdx && !calm}
                    onVideoEnded={advanceForVideo}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Desktop arrows never hide — they are the swipe equivalent. */}
          <motion.button
            type="button"
            className="aslides__arrow aslides__arrow--prev"
            onClick={() => go(-1)}
            aria-label={ct("auto.site.f719940ccc0bc69d")}
            whileTap={{ scale: 0.86 }}
          >
            <Icon name="chevronLeft" size={18} />
          </motion.button>
          <motion.button
            type="button"
            className="aslides__arrow aslides__arrow--next"
            onClick={() => go(1)}
            aria-label={ct("auto.site.6142ea6c0a3fdf05")}
            whileTap={{ scale: 0.86 }}
          >
            <Icon name="chevronRight" size={18} />
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

/** The office's own words for a slide's design, for the drawer's row. */
export function slideDesignNote(slide: AnnouncementSlide, design: SlideDesign | undefined): string {
  if (!design) return "";
  const pinned = String(slide.design || "").trim();
  return (pinned && pinned !== "auto" ? "" : "Automatic — ") + slideDesignName(design);
}
