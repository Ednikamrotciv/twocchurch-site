/* Announcement slides: uploads composed into designed slides, each upload its own design.
   Fixed poster palette (pages.css); edited under Events & notices. */

export type SlideDesign = "plate" | "band" | "arch" | "rays" | "seal" | "split" | "numeral" | "ribbon";

/** The design set, in the order the assigner works through it. */
export const SLIDE_DESIGNS: { id: SlideDesign; name: string; blurb: string }[] = [
  { id: "plate", name: "Parchment plate", blurb: "A printed plate on parchment, the words set beneath it." },
  { id: "band", name: "Crimson band", blurb: "The picture full-bleed, the words stacked down a crimson band." },
  { id: "arch", name: "Sanctuary arch", blurb: "The picture inside a gold arch, on a dark wall." },
  { id: "rays", name: "Ray card", blurb: "A warm picture, rays behind, and a crimson card of words." },
  { id: "seal", name: "Seal & mandala", blurb: "A mandala seal over the picture, the words at its centre." },
  { id: "split", name: "Two-part poster", blurb: "Picture above a gold rule, the words on the panel beneath." },
  { id: "numeral", name: "Numbered plate", blurb: "A numbered column of words beside a framed picture." },
  { id: "ribbon", name: "Ribbon", blurb: "A warm picture with a parchment ribbon across the foot." },
];

export const SLIDE_DESIGN_IDS: SlideDesign[] = SLIDE_DESIGNS.map((d) => d.id);

export function slideDesignName(id: string): string {
  return SLIDE_DESIGNS.find((d) => d.id === id)?.name || "Automatic";
}

export type AnnouncementSlide = {
  id: string;
  /** The picture: an upload, a pasted address, or one of the bundled photos. */
  image: string;
  /** The big words on the slide. */
  headline: string;
  /** The small words under them. */
  line: string;
  /** The button's own words — empty, or no link, means the slide carries no button. */
  cta: string;
  /** Where the button goes: a page of this site ("/visit") or a full web address. */
  link: string;
  /** A pinned design id, or "auto" for one of the slide's own. */
  design: string;
  /** Off keeps the slide (and its picture) without showing it. */
  active: boolean;
  /** Last day the slide may show, "YYYY-MM-DD" — empty means it never lapses. */
  expiresDate?: string;
  /** Last time on that day, "HH:MM" — empty means the end of the day. */
  expiresTime?: string;
};

export const SLIDES: AnnouncementSlide[] = [
  /* Office request: no "You are welcome" headline exists in the code — only
     "Welcome home" ever shipped — so per the fallback ("if you cant find it
     empty all the slide and clean") the box ships with NO announcement slides.
     Empty is clean: the box keeps turning with the welcome photo/logo
     (see AnnouncementSlides stand-in) instead of going blank. */
];

/** A slide upload visitors can play: mp4/m4v/webm/ogv/ogg/mov (with ?/# trailers). */
const SLIDE_VIDEO_FILE = /\.(mp4|m4v|webm|ogv|ogg|mov)(\?|#|$)/i;

/** True when the slide's upload is a video file, not a picture. */
export function isSlideVideoUrl(input: string): boolean {
  return SLIDE_VIDEO_FILE.test(String(input || "").trim());
}

/** The slides the site shows: the ones the office has switched on, that carry something. */
export function visibleSlides(slides: AnnouncementSlide[] = SLIDES): AnnouncementSlide[] {
  return slides.filter((s) => s && s.active !== false && !isSlideExpired(s) && (String(s.image || "").trim() || String(s.headline || "").trim()));
}

/**
 * When a slide's own time runs out — a local-time instant, or null when the
 * office set no last day. No time means the end of the last day.
 */
export function slideExpiryAt(slide: AnnouncementSlide): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(slide?.expiresDate || "").trim());
  if (!m) return null;
  const t = /^(\d{2}):(\d{2})/.exec(String(slide?.expiresTime || "").trim());
  const hh = t ? Number(t[1]) : 23;
  const mm = t ? Number(t[2]) : 59;
  if (hh > 23 || mm > 59) return null;
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm, 59).getTime();
  return Number.isFinite(at) ? at : null;
}

/** True once the slide's own last moment has passed. */
export function isSlideExpired(slide: AnnouncementSlide, now: number = Date.now()): boolean {
  const at = slideExpiryAt(slide);
  return at !== null && now > at;
}

/** The list with every lapsed slide taken out — what clearing them means. */
export function purgeExpiredSlides(slides: AnnouncementSlide[]): AnnouncementSlide[] {
  if (!Array.isArray(slides)) return slides;
  const now = Date.now();
  return slides.some((s) => isSlideExpired(s, now)) ? slides.filter((s) => !isSlideExpired(s, now)) : slides;
}

/**
 * FNV-1a. Small, fast, and — unlike `Math.random()` — the same on every device
 * and every load, so a slide never changes its design behind the office's back.
 */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A slide's own design: read off the picture (a pinned `design` skips this). */
export function slideDesignOf(slide: AnnouncementSlide, taken: string[] = []): SlideDesign {
  const pool = SLIDE_DESIGN_IDS;
  const start = hash(`${slide.image || ""}|${slide.id || ""}`) % pool.length;
  for (let step = 0; step < pool.length; step++) {
    const id = pool[(start + step) % pool.length];
    if (!taken.includes(id)) return id;
  }
  return pool[start];
}

/** Every slide's design, lined up with the list (stable order, so reorder never re-designs). */
export function slideDesigns(slides: AnnouncementSlide[]): SlideDesign[] {
  const order = slides.map((slide, index) => ({ slide, index }));
  order.sort((a, b) => String(a.slide.id || a.slide.image || a.index).localeCompare(String(b.slide.id || b.slide.image || b.index)));
  const pinned = new Set<string>();
  for (const { slide } of order) {
    const id = String(slide.design || "").trim();
    if (id && id !== "auto" && (SLIDE_DESIGN_IDS as string[]).includes(id)) pinned.add(id);
  }
  const taken: string[] = [...pinned];
  const out: SlideDesign[] = [];
  for (const { slide, index } of order) {
    const pinnedId = String(slide.design || "").trim();
    const design = pinnedId && pinnedId !== "auto" && (SLIDE_DESIGN_IDS as string[]).includes(pinnedId)
      ? (pinnedId as SlideDesign)
      : slideDesignOf(slide, taken);
    out[index] = design;
    taken.push(design);
  }
  return out;
}

/* The 3D arrangements the slide space can take (see src/components/slides3d.tsx),
   chosen by the office in the *Slide space display* section. */
export type SlideLayout =
  | "coverflow" | "ring" | "stack" | "wall" | "fan" | "tunnel" | "helix"
  | "wave" | "cascade" | "pyramid" | "vortex" | "orbit" | "arch" | "zigzag"
  | "tower" | "horizon" | "bloom" | "comet" | "tide" | "crown";

export const SLIDE_LAYOUT_IDS: SlideLayout[] = [
  "coverflow", "ring", "stack", "wall", "fan", "tunnel", "helix",
  "wave", "cascade", "pyramid", "vortex", "orbit", "arch", "zigzag",
  "tower", "horizon", "bloom", "comet", "tide", "crown",
];
