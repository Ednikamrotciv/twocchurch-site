/* ============================================================================
   The announcement slide space.

   The home page's welcome box shows the office's announcement pictures, one at
   a time: swiper drives the stage (a creative glide, a rewind at the ends, a
   slow self-advance) and framer-motion drives the entrance and the arrows.
   A hold — hover, focus, or touch — freezes the advance.

   A picture is not printed as a plain photograph: it is *composed* into a
   designed slide, and — the point of the whole thing — **the slide takes its
   colours from the picture**. `src/lib/palette.ts` samples the upload and hands
   back a palette that is checked for contrast, so a red flyer, a blue flyer and
   a black-and-white one each get their own poster in their own colours, with
   words that stay readable on top. The same read decides which side of the
   picture is quiet (where the words may sit without covering the subject) and
   where it is busiest (so the artwork keeps that part).

   The space itself is one shape for every announcement: **the slide frame**
   (1600×1200, the house 4:3 — see `src/lib/slideFrame.ts`). A poster the office
   uploads is re-cut to that frame rather than cropped into it, and a picture
   already on the site at some other shape is cut as it is shown, so the space
   is the same size and the same resolution whichever announcement is on it and
   the whole of every picture is on show.

   Eight designs live here (see `SLIDE_DESIGNS` in src/data/slides.ts) and the
   picture fills the slide in every one of them. Which design a slide gets is
   decided by the picture itself (`slideDesigns`), so every upload is designed
   differently and no design ever changes behind the office's back.

   Layout is in container units (`cqw`, with a rem fallback before each one), so
   one set of designs fits the box at any size — and the box itself is the
   frame's own shape (`--slide-aspect` is `SLIDE_FRAME.aspect` for every slide),
   full-bleed on the band's own stage, so the space never jumps shape as the
   slides turn.

   Visiting any page with `?slides=all` in the address (e.g. `#/?slides=all`)
   lays every design out in a grid instead — the office's preview of the set,
   and the harness these designs were drawn and checked in.

   The moving stage itself is 3D (see ./slides3d.tsx): one textured cuboid in
   a slow, seamless spin — gradual enough to read the depth — with the
   flat swiper stage below kept as the fallback for reduced motion, missing
   WebGL, or a stage that throws.
   ========================================================================== */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swiper from "swiper";
import { Autoplay, EffectCreative } from "swiper/modules";
import { motion } from "framer-motion";
import { Link } from "../lib/router";
import { Icon } from "./ui";
import { photoOr } from "../data/photos";
import { useCmsVersion } from "../lib/cms";
import { ct } from "../data/copy";
import { loadSlidePalette, paletteFor, type SlidePalette } from "../lib/palette";
import { SLIDE_FRAME, framedImageSync, framedImageUrl } from "../lib/slideFrame";
import { SLIDES, SLIDE_DESIGNS, slideDesigns, visibleSlides, slideDesignName, type AnnouncementSlide, type SlideDesign } from "../data/slides";
import { CuboidSpace3D, useWebGLAvailable, StageErrorBoundary, type CuboidApi } from "./slides3d";

/** How long a slide waits before the space moves to the next one on its own. */
const ADVANCE_MS = 9000;

/** How small the auto-fit will take a poster's words before it gives up. */
const FIT_FLOOR = 0.6;

/** Everything a design centres its words on, and the block those words sit in. */
const TEXT_SELECTOR = ".aslide__headline, .aslide__line, .aslide__action, .aslide__tag, .aslide__orn, .aslide__star, .aslide__diamond, .aslide__num";

/* ---------------------------------------------------------------------- colours */

/**
 * The picture's colours, read once per address and remembered. Until the read
 * lands (and forever, if the picture cannot be read) the designs use the poster
 * palette they shipped with, so a slide is never half-dressed.
 */
function useSlidePalette(url: string): SlidePalette {
  const [palette, setPalette] = useState(() => paletteFor(url));
  useEffect(() => {
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
  }, [url]);
  return palette;
}

/**
 * The picture as the slide shows it: in the frame. A picture that is already
 * the frame's shape is used as it is; one that is not (an address the office
 * pasted, or a picture uploaded before the frame existed) is cut in the browser
 * and swapped in when it is ready — the original stays on screen until then, so
 * a slide is never empty while it waits.
 */
function useSlideFrame(url: string): string {
  const [src, setSrc] = useState(() => framedImageSync(url));
  useEffect(() => {
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
  }, [url]);
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
}: {
  slide: AnnouncementSlide;
  design: SlideDesign;
  index?: number;
  total?: number;
  /** The face currently head-on: refit its words when it turns to face out. */
  spotlight?: boolean;
}) {
  /* A slide with no picture of its own still has to look finished: the welcome
     photo stands in until the office uploads one (see `photoOr`). */
  const original = photoOr(slide.image, "welcome");
  /* Shown in the frame; read for its colours as it was photographed, so the
     palette is the office's own picture and not the mat the frame puts round it. */
  const photo = useSlideFrame(original);
  const palette = useSlidePalette(original);
  const headline = String(slide.headline || "").trim();
  const line = String(slide.line || "").trim();
  const link = String(slide.link || "").trim();
  const cta = String(slide.cta || "").trim();

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

  /* A poster's words must never run off the edge of the poster. Every size in
     the designs is a share of the box's width (see pages.css), so when the
     office writes more than the design's share of the picture can hold, the
     whole block of words is scaled down together until it fits — but never
     past FIT_FLOOR, so it cannot shrink into illegibility. */
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

  /* The box's *shape* is the picture's own (see `--slide-aspect`), so it can
     change after the first fit — when the picture's proportions are read, when
     the space moves to a slide with a differently-shaped upload, or simply when
     the window is resized. Measure again whenever the slide's own box changes,
     or the words keep a fit that was right for a box that is no longer there. */
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
      window.location.hash = strip(window.location.hash, "#/");
    } else {
      window.location.search = strip(window.location.search, "");
    }
  } catch {
    window.location.hash = "#/";
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
  const previewing = showingAllDesigns();
  /* Read once: flipping the OS setting mid-visit does not rebuild the stage. */
  const [calm] = useState(() => prefersReducedMotion());
  const webgl = useWebGLAvailable();
  /* The 3D cuboid turns itself, slowly and without steps; the arrows, swipe,
     keys or a tap just lend it speed. */
  const cuboidApi = useRef<CuboidApi | null>(null);
  const count = live.length;
  const multi = count > 1 && !previewing;
  const stageRef = useRef<HTMLDivElement>(null);
  const swiperRef = useRef<Swiper | null>(null);
  const push3d = (dir: 1 | -1) => {
    cuboidApi.current?.push(dir);
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
    if (!el || !multi) return;
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
        },
      },
    });
    swiperRef.current = sw;
    mark(el, sw.activeIndex);
    return () => {
      swiperRef.current = null;
      sw.destroy(true, true);
    };
  }, [multi, calm]);

  /* A hold (hover, focus, or touch) freezes swiper's own timer. */
  useEffect(() => {
    const sw = swiperRef.current;
    const timer = sw && sw.autoplay && !calm ? sw.autoplay : null;
    if (!timer) return;
    if (held) timer.stop();
    else timer.start();
  }, [held, calm]);

  const go = (step: number) => {
    const sw = swiperRef.current;
    if (!sw || !multi) return;
    if (step > 0) sw.slideNext();
    else sw.slidePrev();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!multi) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  };

  /* A sideways swipe turns the 3D stage; up-and-down scrolling is untouched. */
  const touchX = useRef<number | null>(null);

  const onKeyDown3d = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!multi) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      push3d(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      push3d(1);
    }
  };

  if (!count) {
    /* No announcements posted: the box keeps the picture that used to live here
       (see `photoOr`) rather than going empty — in the frame too, so the space
       is the shape it will be the moment a slide arrives. */
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
            onTouchStart={(e) => {
              touchX.current = e.touches[0]?.clientX ?? null;
              setHeld(true);
            }}
            onTouchEnd={(e) => {
              const start = touchX.current;
              touchX.current = null;
              setHeld(false);
              if (start === null) return;
              const dx = (e.changedTouches[0]?.clientX ?? start) - start;
              if (dx > 40) push3d(-1);
              else if (dx < -40) push3d(1);
            }}
            onTouchCancel={() => {
              touchX.current = null;
              setHeld(false);
            }}
            role="region"
            aria-roledescription="carousel"
            aria-label={ct("auto.site.ed1bc718392f9ee1")}
          >
            <StageErrorBoundary fallback={<img className="aslide__photo" src={standIn} alt="" />}>
              <CuboidSpace3D slides={live} apiRef={cuboidApi} held={held} />
            </StageErrorBoundary>
            {multi ? (
              <>
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
              </>
            ) : null}
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
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocusCapture={() => setHeld(true)}
          onBlurCapture={() => setHeld(false)}
          onKeyDown={onKeyDown}
          role="region"
          aria-roledescription="carousel"
          aria-label={ct("auto.site.ed1bc718392f9ee1")}
        >
          <div
            className="aslides__viewport swiper"
            ref={stageRef}
            onPointerDown={() => setHeld(true)}
            onPointerUp={() => setHeld(false)}
            onPointerCancel={() => setHeld(false)}
          >
            <div className="swiper-wrapper">
              {live.map((s, i) => (
                <div className="swiper-slide" key={s.id || i}>
                  <AnnouncementSlide slide={s} design={designs[i] || "plate"} index={i + 1} total={count} />
                </div>
              ))}
            </div>
          </div>

          {multi ? (
            <>
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
            </>
          ) : null}
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
